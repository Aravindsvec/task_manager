const API = 'http://localhost:8000';
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

let allTasks = [];
let currentFilter = 'all';

async function loadTasks() {
  try {
    const res = await fetch(`${API}/tasks`);
    allTasks = await res.json();
    renderTasks();
    showStatus('Connected to API', 'ok');
  } catch (e) {
    showStatus('Cannot connect to API — is the backend running?', 'error');
  }
}

function getFilteredTasks() {
  let tasks = allTasks;
  if (currentFilter === 'active') tasks = allTasks.filter(t => !t.done);
  if (currentFilter === 'done')   tasks = allTasks.filter(t => t.done);
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
  });
}

function renderTasks() {
  updateStats();
  const tasks = getFilteredTasks();
  const list  = document.getElementById('taskList');

  if (tasks.length === 0) {
    const msg = currentFilter === 'done'   ? 'No completed tasks yet.'
              : currentFilter === 'active' ? 'All caught up — nothing active!'
              : 'No tasks yet. Add one above!';
    list.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }

  list.innerHTML = tasks.map(t => {
    const priority = t.priority || 'medium';
    const due      = t.due_date  || '';
    const dueLabel = formatDue(due);
    const overdue  = due && !t.done && new Date(due + 'T00:00:00') < new Date().setHours(0, 0, 0, 0);

    return `
      <li class="task-item priority-${priority} ${t.done ? 'done' : ''}"
          data-id="${t.id}"
          data-title="${escapeAttr(t.title)}"
          data-desc="${escapeAttr(t.description)}"
          data-priority="${priority}"
          data-due="${due}">
        <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''} />
        <div class="task-body">
          <div class="task-title">${escapeHtml(t.title)}</div>
          <div class="task-meta">
            <span class="badge badge-${priority}">${priority}</span>
            ${dueLabel ? `<span class="task-due ${overdue ? 'overdue' : ''}">${overdue ? '⚠ ' : ''}${dueLabel}</span>` : ''}
          </div>
        </div>
        <button class="btn-del" data-id="${t.id}" title="Delete">✕</button>
      </li>`;
  }).join('');
}

// Single delegated listener — no inline handlers, so no attribute-quoting bugs
document.getElementById('taskList').addEventListener('change', async e => {
  const checkbox = e.target.closest('.task-check');
  if (!checkbox) return;
  const li = checkbox.closest('.task-item');
  await toggleTask(
    li.dataset.id,
    li.dataset.title,
    li.dataset.desc,
    checkbox.checked,
    li.dataset.priority,
    li.dataset.due,
  );
});

document.getElementById('taskList').addEventListener('click', async e => {
  const btn = e.target.closest('.btn-del');
  if (!btn) return;
  await deleteTask(btn.dataset.id);
});

function updateStats() {
  const total = allTasks.length;
  const done  = allTasks.filter(t => t.done).length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('statTotal').textContent    = `${total} task${total !== 1 ? 's' : ''}`;
  document.getElementById('statPct').textContent      = `${pct}% done`;
  document.getElementById('progressFill').style.width = `${pct}%`;
}

function formatDue(dateStr) {
  if (!dateStr) return '';
  const d     = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((d - today) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0)    return `${Math.abs(diff)}d overdue`;
  if (diff < 7)    return `in ${diff}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
}

async function addTask() {
  const input    = document.getElementById('taskInput');
  const priority = document.getElementById('priorityInput').value;
  const due_date = document.getElementById('dueDateInput').value;
  const title    = input.value.trim();
  if (!title) return;
  try {
    await fetch(`${API}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: '', done: false, priority, due_date }),
    });
    input.value = '';
    document.getElementById('dueDateInput').value = '';
    await loadTasks();
  } catch (e) {
    showStatus('Failed to add task', 'error');
  }
}

async function toggleTask(id, title, desc, done, priority, due_date) {
  try {
    await fetch(`${API}/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description: desc, done, priority, due_date }),
    });
    await loadTasks();
  } catch (e) {
    showStatus('Failed to update task', 'error');
  }
}

async function deleteTask(id) {
  try {
    await fetch(`${API}/tasks/${id}`, { method: 'DELETE' });
    await loadTasks();
  } catch (e) {
    showStatus('Failed to delete task', 'error');
  }
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  if (type === 'ok') setTimeout(() => { el.className = 'status'; }, 2000);
}

document.getElementById('taskInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTask();
});

loadTasks();
