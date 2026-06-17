const API = 'http://localhost:8000';

async function loadTasks() {
  try {
    const res = await fetch(`${API}/tasks`);
    const tasks = await res.json();
    renderTasks(tasks);
    showStatus('Connected to API', 'ok');
  } catch (e) {
    showStatus('Cannot connect to API — is the backend running?', 'error');
  }
}

function renderTasks(tasks) {
  const list = document.getElementById('taskList');
  if (tasks.length === 0) {
    list.innerHTML = '<div class="empty">No tasks yet. Add one above!</div>';
    return;
  }
  list.innerHTML = tasks.map(t => `
    <li class="task-item ${t.done ? 'done' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''}
        onchange="toggleTask('${t.id}', '${t.title.replace(/'/g, "\\'")}', '${t.description.replace(/'/g, "\\'")}', this.checked)" />
      <span class="task-title">${escapeHtml(t.title)}</span>
      <button class="btn-del" onclick="deleteTask('${t.id}')">Delete</button>
    </li>
  `).join('');
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

async function addTask() {
  const input = document.getElementById('taskInput');
  const title = input.value.trim();
  if (!title) return;
  try {
    await fetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: '', done: false }),
    });
    input.value = '';
    loadTasks();
  } catch (e) {
    showStatus('Failed to add task', 'error');
  }
}

async function toggleTask(id, title, desc, done) {
  try {
    await fetch(`${API}/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: desc, done }),
    });
    loadTasks();
  } catch (e) {
    showStatus('Failed to update task', 'error');
  }
}

async function deleteTask(id) {
  try {
    await fetch(`${API}/tasks/${id}`, { method: 'DELETE' });
    loadTasks();
  } catch (e) {
    showStatus('Failed to delete task', 'error');
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  if (type === 'ok') setTimeout(() => (el.style.display = 'none'), 2000);
}

document.getElementById('taskInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTask();
});

loadTasks();
