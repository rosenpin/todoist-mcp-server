#!/usr/bin/env node

const express = require('express');
const { TodoistApi } = require('@doist/todoist-api-typescript');

// Check for API token
const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN;
if (!TODOIST_API_TOKEN) {
  console.error("Error: TODOIST_API_TOKEN environment variable is required");
  process.exit(1);
}

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize Todoist client
const todoistClient = new TodoistApi(TODOIST_API_TOKEN);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'todoist-http-server' });
});

// Create task endpoint
app.post('/tasks', async (req, res) => {
  try {
    const { content, description, due_string, priority } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const task = await todoistClient.addTask({
      content,
      description,
      dueString: due_string,
      priority
    });

    res.json({
      success: true,
      task: {
        id: task.id,
        content: task.content,
        description: task.description,
        due: task.due,
        priority: task.priority
      }
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ 
      error: 'Failed to create task', 
      message: error.message || String(error) 
    });
  }
});

// Get tasks endpoint
app.get('/tasks', async (req, res) => {
  try {
    const { project_id, filter, priority, limit = 10 } = req.query;
    
    // Build API parameters
    const apiParams = {};
    if (project_id) {
      apiParams.projectId = project_id;
    }
    if (filter) {
      apiParams.filter = filter;
    }

    // Get tasks from Todoist
    const tasks = await todoistClient.getTasks(Object.keys(apiParams).length > 0 ? apiParams : undefined);

    // Apply additional filters
    let filteredTasks = tasks;
    if (priority) {
      const priorityNum = parseInt(priority);
      filteredTasks = filteredTasks.filter(task => task.priority === priorityNum);
    }
    
    // Apply limit
    const limitNum = parseInt(limit) || 10;
    if (limitNum > 0) {
      filteredTasks = filteredTasks.slice(0, limitNum);
    }

    res.json({
      success: true,
      count: filteredTasks.length,
      tasks: filteredTasks.map(task => ({
        id: task.id,
        content: task.content,
        description: task.description,
        due: task.due,
        priority: task.priority,
        projectId: task.projectId,
        labels: task.labels
      }))
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({ 
      error: 'Failed to get tasks', 
      message: error.message || String(error) 
    });
  }
});

// Complete task endpoint
app.post('/tasks/complete', async (req, res) => {
  try {
    const { task_name } = req.body;
    
    if (!task_name) {
      return res.status(400).json({ error: 'task_name is required' });
    }

    // Search for the task
    const tasks = await todoistClient.getTasks();
    const matchingTask = tasks.find(task => 
      task.content.toLowerCase().includes(task_name.toLowerCase())
    );

    if (!matchingTask) {
      return res.status(404).json({ 
        error: 'Task not found', 
        message: `Could not find a task matching "${task_name}"` 
      });
    }

    // Complete the task
    await todoistClient.closeTask(matchingTask.id);
    
    res.json({
      success: true,
      message: `Successfully completed task: "${matchingTask.content}"`,
      completedTask: {
        id: matchingTask.id,
        content: matchingTask.content
      }
    });
  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({ 
      error: 'Failed to complete task', 
      message: error.message || String(error) 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Todoist HTTP server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
