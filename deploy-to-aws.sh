#!/bin/bash

# Todoist MCP Server AWS Deployment Script
set -e

# Configuration
AWS_REGION="us-east-1"
ENVIRONMENT="prod"
DOMAIN_NAME="" # Set this if you want SSL with your domain

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -r, --region REGION      AWS region (default: us-east-1)"
    echo "  -e, --env ENVIRONMENT    Environment name (default: prod)"
    echo "  -d, --domain DOMAIN      Domain name for SSL (optional)"
    echo "  -i, --initial            Perform initial deployment (deploy infrastructure)"
    echo "  -u, --update             Update application only (push new image)"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -i                    # Initial deployment"
    echo "  $0 -u                    # Update application"
    echo "  $0 -d example.com -i     # Deploy with custom domain"
}

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

check_requirements() {
    log "Checking requirements..."
    
    if ! command -v aws &> /dev/null; then
        error "AWS CLI is not installed"
    fi
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
    fi
    
    if ! command -v npm &> /dev/null; then
        error "Node.js/npm is not installed"
    fi
    
    if [ ! -f "Dockerfile" ]; then
        error "Dockerfile not found. Run from project root directory."
    fi
    
    if [ ! -d "aws-infra" ]; then
        error "aws-infra directory not found. Run from project root directory."
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        error "AWS credentials not configured"
    fi
}

deploy_infrastructure() {
    log "Deploying AWS infrastructure..."
    
    cd aws-infra
    
    # Install CDK dependencies
    log "Installing CDK dependencies..."
    npm install
    
    # Bootstrap CDK if needed
    log "Bootstrapping CDK..."
    npx cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/${AWS_REGION}
    
    # Set environment variables
    export AWS_REGION="$AWS_REGION"
    export ENVIRONMENT="$ENVIRONMENT"
    if [ -n "$DOMAIN_NAME" ]; then
        export DOMAIN_NAME="$DOMAIN_NAME"
    fi
    
    # Deploy all stacks
    log "Deploying CDK stacks..."
    npx cdk deploy --all --require-approval never
    
    cd ..
    
    log "Infrastructure deployment completed!"
}

build_and_push_image() {
    log "Building and pushing Docker image..."
    
    # Get ECR repository URI from CloudFormation output
    REPOSITORY_URI=$(aws cloudformation describe-stacks \
        --stack-name TodoistMcpEcrStack \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`AppRepositoryUri`].OutputValue' \
        --output text)
    
    if [ -z "$REPOSITORY_URI" ]; then
        error "Could not find ECR repository URI. Make sure infrastructure is deployed."
    fi
    
    log "Repository URI: $REPOSITORY_URI"
    
    # Get login token for ECR
    aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REPOSITORY_URI"
    
    # Build image
    log "Building Docker image..."
    docker build -t todoist-mcp-server .
    
    # Tag image
    docker tag todoist-mcp-server:latest "$REPOSITORY_URI:latest"
    docker tag todoist-mcp-server:latest "$REPOSITORY_URI:$(date +%Y%m%d-%H%M%S)"
    
    # Push image
    log "Pushing Docker image..."
    docker push "$REPOSITORY_URI:latest"
    docker push "$REPOSITORY_URI:$(date +%Y%m%d-%H%M%S)"
    
    log "Image pushed successfully!"
}

update_service() {
    log "Updating ECS service..."
    
    # Force new deployment of the ECS service
    aws ecs update-service \
        --cluster todoist-mcp-cluster \
        --service todoist-mcp-service \
        --force-new-deployment \
        --region "$AWS_REGION" > /dev/null
    
    log "Service update initiated. Waiting for deployment to complete..."
    
    # Wait for service to be stable
    aws ecs wait services-stable \
        --cluster todoist-mcp-cluster \
        --services todoist-mcp-service \
        --region "$AWS_REGION"
    
    log "Service updated successfully!"
}

get_deployment_info() {
    log "Getting deployment information..."
    
    # Get load balancer DNS name
    LB_DNS=$(aws cloudformation describe-stacks \
        --stack-name TodoistMcpAlbStack \
        --region "$AWS_REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDns`].OutputValue' \
        --output text)
    
    echo ""
    echo "=== Deployment Information ==="
    echo "Load Balancer DNS: $LB_DNS"
    if [ -n "$DOMAIN_NAME" ]; then
        echo "Custom Domain: https://$DOMAIN_NAME"
        warn "Make sure to create a CNAME record pointing $DOMAIN_NAME to $LB_DNS"
    else
        echo "Access URL: http://$LB_DNS"
    fi
    echo "Health Check: http://$LB_DNS/health"
    echo "Auth Page: http://$LB_DNS/auth"
    echo ""
}

# Parse arguments
INITIAL=false
UPDATE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -e|--env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -d|--domain)
            DOMAIN_NAME="$2"
            shift 2
            ;;
        -i|--initial)
            INITIAL=true
            shift
            ;;
        -u|--update)
            UPDATE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            error "Unknown option $1"
            ;;
        *)
            error "Unexpected argument $1"
            ;;
    esac
done

# Validate arguments
if [ "$INITIAL" = false ] && [ "$UPDATE" = false ]; then
    error "Either --initial or --update must be specified"
fi

if [ "$INITIAL" = true ] && [ "$UPDATE" = true ]; then
    error "Cannot specify both --initial and --update"
fi

# Main execution
check_requirements

if [ "$INITIAL" = true ]; then
    deploy_infrastructure
    build_and_push_image
    update_service
    get_deployment_info
elif [ "$UPDATE" = true ]; then
    build_and_push_image
    update_service
    get_deployment_info
fi

log "Deployment completed successfully!"