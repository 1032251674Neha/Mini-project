const API = "/api";

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
const page = document.body.dataset.page || "dashboard";

let projects = [];
let tasks = [];
let dependencies = [];
let history = [];

async function apiRequest(url, options = {}) {
  const response = await fetch(API + url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || `Request failed (${response.status})`
    );
  }

  return data;
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function toast(message) {
  const element = $("#toast");
  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2500);
}

function projectName(id) {
  return projects.find(p => Number(p.id) === Number(id))?.name
    || "Unknown project";
}

function statusClass(status) {
  return "status-" +
    String(status || "Pending").toLowerCase().replaceAll(" ", "-");
}

function priorityClass(priority) {
  return "priority-" + String(priority || "Medium").toLowerCase();
}

function fmtDate(date) {
  if (!date) return "—";

  const value = String(date).slice(0, 10);
  const d = new Date(value + "T00:00:00");

  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
}

function fmtDateTime(value) {
  if (!value) return "—";

  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString("en-IN");
}

function showError(error) {
  console.error(error);
  toast(error.message || "Something went wrong");
}

async function loadData() {
  const results = await Promise.all([
    apiRequest("/projects"),
    apiRequest("/tasks"),
    apiRequest("/dependencies"),
    apiRequest("/history")
  ]);

  projects = Array.isArray(results[0]) ? results[0] : [];
  tasks = Array.isArray(results[1]) ? results[1] : [];
  dependencies = Array.isArray(results[2]) ? results[2] : [];
  history = Array.isArray(results[3]) ? results[3] : [];
}

async function refresh() {
  try {
    await loadData();

    if (page === "dashboard") renderDashboard();
    if (page === "tasks") renderTasks();
    if (page === "projects") renderProjects();
    if (page === "dependencies") renderDependencies();
    if (page === "history") renderHistory();
  } catch (error) {
    showError(error);
  }
}

function navSetup() {
  const current = $(`[data-nav="${page}"]`);
  if (current) current.classList.add("active");

  $("#menuToggle")?.addEventListener("click", () => {
    $("#sidebar")?.classList.toggle("open");
  });

  $("#globalSearch")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      const term = $("#globalSearch").value.trim();
      location.href = "tasks.html?q=" + encodeURIComponent(term);
    }
  });
}

function taskRows(list) {
  if (!list.length) {
    return `<tr><td colspan="6">
      <div class="empty">
        <b>No tasks found</b>
        Create a task to get started.
      </div>
    </td></tr>`;
  }

  return list.map(task => `
    <tr>
      <td>
        <span class="task-name">${esc(task.title)}</span>
        <span class="subtext">TASK-${task.id}</span>
      </td>
      <td>${esc(projectName(task.projectId))}</td>
      <td>
        <span class="${priorityClass(task.priority)}">
          ● ${esc(task.priority || "Medium")}
        </span>
      </td>
      <td>
        <span class="badge ${statusClass(task.status)}">
          ${esc(task.status || "Pending")}
        </span>
      </td>
      <td>${fmtDate(task.deadline)}</td>
      <td>
        <div class="row-actions">
         
<button class="icon-btn" data-edit-task="${task.id}">Edit</button>
<button class="icon-btn" data-undo-task="${task.id}">Undo</button>
<button class="icon-btn" data-delete-task="${task.id}">Delete</button>

        </div>
      </td>
    </tr>
  `).join("");
}

function renderDashboard() {
  const completed = tasks.filter(t => t.status === "Completed").length;
  const pending = tasks.filter(t => t.status === "Pending").length;
  const progress = tasks.filter(t => t.status === "In Progress").length;

  if ($("#stats")) {
    $("#stats").innerHTML = [
      ["Total Tasks", tasks.length, "▤", "All tasks in workspace"],
      [
        "Completed",
        completed,
        "✓",
        tasks.length
          ? Math.round(completed / tasks.length * 100) + "% completion"
          : "No tasks yet"
      ],
      ["In Progress", progress, "◷", "Currently being worked on"],
      ["Projects", projects.length, "▦", "Organized workspaces"]
    ].map(item => `
      <div class="stat">
        <div class="stat-top">
          ${item[0]} <span class="stat-icon">${item[2]}</span>
        </div>
        <div class="stat-value">${item[1]}</div>
        <div class="stat-note">${item[3]}</div>
      </div>
    `).join("");
  }

  if ($("#recentTasks")) {
    $("#recentTasks").innerHTML = taskRows(
      tasks.slice().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 5)
    );
  }

  const total = tasks.length || 1;

  if ($("#statusProgress")) {
    $("#statusProgress").innerHTML = [
      ["Completed", completed, "#159b72"],
      ["In Progress", progress, "#6258e8"],
      ["Pending", pending, "#c47b12"]
    ].map(item => `
      <div class="progress-row">
        <div class="progress-info">
          <span>${item[0]}</span>
          <span>${item[1]} tasks · ${Math.round(item[1] / total * 100)}%</span>
        </div>
        <div class="track">
          <div class="fill"
            style="width:${item[1] / total * 100}%;background:${item[2]}">
          </div>
        </div>
      </div>
    `).join("");
  }

  if ($("#activityList")) {
    $("#activityList").innerHTML = history.length
      ? history.slice(0, 5).map(item => {
          const action = item.action ||
            (item.newStatus ? "Task status changed" : "Task activity");
          const detail = item.detail ||
            (
              item.oldStatus || item.old_status
                ? `${item.oldStatus || item.old_status || ""} → ${item.newStatus || item.new_status || ""}`
                : `Task ${item.taskId || item.task_id || ""}`
            );
          const at = item.at || item.changedAt || item.changed_at;

          return `
            <div class="activity-item">
              <div class="activity-dot">↗</div>
              <div>
                <strong>${esc(action)}</strong>
                <small>${esc(detail)} · ${esc(fmtDateTime(at))}</small>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="empty">
          <b>No activity yet</b>
          Task activity will appear here.
        </div>`;
  }

  bindTaskButtons();
}

function renderTasks() {
  const search = $("#taskSearch");
  const statusFilter = $("#statusFilter");
  const priorityFilter = $("#priorityFilter");
  const params = new URLSearchParams(location.search);

  if (search && !search.dataset.initialized) {
    search.value = params.get("q") || "";
    search.dataset.initialized = "true";
  }

  function paint() {
    let list = tasks.slice();
    const term = (search?.value || "").trim().toLowerCase();

    if (term) {
      list = list.filter(t =>
        `${t.title} ${projectName(t.projectId)} ${t.id}`
          .toLowerCase().includes(term)
      );
    }

    if (statusFilter && statusFilter.value !== "all") {
      list = list.filter(t => t.status === statusFilter.value);
    }

    if (priorityFilter && priorityFilter.value !== "all") {
      list = list.filter(t => t.priority === priorityFilter.value);
    }

    if ($("#taskRows")) $("#taskRows").innerHTML = taskRows(list);
    bindTaskButtons();
  }

  if (search && !search.dataset.bound) {
    search.addEventListener("input", paint);
    search.dataset.bound = "true";
  }

  if (statusFilter && !statusFilter.dataset.bound) {
    statusFilter.addEventListener("change", paint);
    statusFilter.dataset.bound = "true";
  }

  if (priorityFilter && !priorityFilter.dataset.bound) {
    priorityFilter.addEventListener("change", paint);
    priorityFilter.dataset.bound = "true";
  }

  paint();
}

function renderProjects() {
  if (!$("#projectRows")) return;

  $("#projectRows").innerHTML = projects.length
    ? projects.map(project => {
        const projectTasks = tasks.filter(
          t => Number(t.projectId) === Number(project.id)
        );

        return `
          <tr>
            <td>
              <span class="task-name">${esc(project.name)}</span>
              <span class="subtext">PROJECT-${project.id}</span>
            </td>
            <td>${esc(project.description || "—")}</td>
            <td>${projectTasks.length}</td>
            <td>${projectTasks.filter(t => t.status === "Completed").length}</td>
            <td>${fmtDate(project.createdAt)}</td>
            <td>
              <div class="row-actions">
                <button class="icon-btn" data-edit-project="${project.id}">Edit</button>
                <button class="icon-btn" data-delete-project="${project.id}">Delete</button>
              </div>
            </td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="6">
        <div class="empty">
          <b>No projects yet</b>
          Create your first project.
        </div>
      </td></tr>`;

  $$("[data-edit-project]").forEach(button => {
    button.onclick = () => openProject(Number(button.dataset.editProject));
  });

  $$("[data-delete-project]").forEach(button => {
    button.onclick = () => deleteProject(Number(button.dataset.deleteProject));
  });
}

function renderDependencies() {
  if (!$("#dependencyList")) return;

  $("#dependencyList").innerHTML = dependencies.length
    ? dependencies.map(dep => `
        <div class="dependency-flow">
          <span class="node">
            ${esc(tasks.find(t =>
              Number(t.id) === Number(dep.prerequisiteId)
            )?.title || "Missing task")}
          </span>
          <span class="arrow">→</span>
          <span class="node">
            ${esc(tasks.find(t =>
              Number(t.id) === Number(dep.dependentId)
            )?.title || "Missing task")}
          </span>
          <button class="icon-btn" data-delete-dep="${esc(dep.id)}">Remove</button>
        </div>
      `).join("")
    : `<div class="empty">
        <b>No dependencies configured</b>
        Add a prerequisite relationship between two tasks.
      </div>`;

  $$("[data-delete-dep]").forEach(button => {
    button.onclick = async () => {
      if (!confirm("Remove this dependency?")) return;

      try {
        
const [prerequisiteId, dependentId] =
  button.dataset.deleteDep.split("-");

await apiRequest(
  `/dependencies/${prerequisiteId}/${dependentId}`,
  { method: "DELETE" }
);

        await refresh();
        toast("Dependency removed");
      } catch (error) {
        showError(error);
      }
    };
  });

  if ($("#topologicalOrder")) {
  $("#topologicalOrder").innerHTML = dependencies.length === 0
    ? "<p>No dependencies available.</p>"
    : topologicalSort(tasks, dependencies);
}
}

function topologicalSort(taskList, deps) {
  const ids = taskList.map(t => Number(t.id)).sort((a, b) => a - b);
  const indegree = {};

  ids.forEach(id => indegree[id] = 0);

  deps.forEach(dep => {
    const pre = Number(dep.prerequisiteId);
    const dependent = Number(dep.dependentId);

    if (indegree[pre] !== undefined && indegree[dependent] !== undefined) {
      indegree[dependent]++;
    }
  });

  const queue = ids.filter(id => indegree[id] === 0);
  const output = [];

  while (queue.length) {
    const current = queue.shift();
    output.push(current);

    deps
      .filter(d => Number(d.prerequisiteId) === current)
      .forEach(dep => {
        const next = Number(dep.dependentId);

        if (indegree[next] !== undefined) {
          indegree[next]--;

          if (indegree[next] === 0) queue.push(next);
        }
      });
  }

  if (output.length !== ids.length) {
    return `<span class="badge status-pending">
      Cycle detected — review dependencies
    </span>`;
  }

  return output.length
    ? output.map(id => `
        <span class="node">
          ${esc(taskList.find(t => Number(t.id) === id)?.title || id)}
        </span>
      `).join(' <span class="arrow">→</span> ')
    : "No tasks available";
}

function renderHistory() {
  if (!$("#historyRows")) return;

  $("#historyRows").innerHTML = history.length
    ? history.map(item => {
        const oldStatus = item.oldStatus || item.old_status || "";
        const newStatus = item.newStatus || item.new_status || "";
        const action = item.action ||
          (newStatus ? "Status changed" : "Task activity");
        const detail = item.detail ||
          (newStatus
            ? `Task ${item.taskId || item.task_id || ""}: ${oldStatus} → ${newStatus}`
            : `Task ${item.taskId || item.task_id || ""}`);
        const at = item.at || item.changedAt || item.changed_at;

        return `
          <tr>
            <td>${esc(fmtDateTime(at))}</td>
            <td>
              <span class="badge status-in-progress">${esc(action)}</span>
            </td>
            <td>${esc(detail)}</td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="3">
        <div class="empty">
          <b>No history available</b>
          Task history will appear here when recorded by the backend.
        </div>
      </td></tr>`;
}

function showModal(title, body, onSave) {
  const modal = $("#modalBackdrop");
  if (!modal) {
    toast("Modal element was not found in HTML");
    return;
  }

  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = body;
  modal.classList.add("show");

  const close = () => modal.classList.remove("show");

  $("#modalClose").onclick = close;
  $("#modalCancel").onclick = close;

  $("#modalSave").onclick = async () => {
    const saveButton = $("#modalSave");
    saveButton.disabled = true;

    try {
      const result = await onSave();
      if (result !== false) close();
    } catch (error) {
      showError(error);
    } finally {
      saveButton.disabled = false;
    }
  };

  modal.onclick = event => {
    if (event.target === modal) close();
  };
}

function projectOptions(selected) {
  return projects.map(project => `
    <option value="${project.id}"
      ${Number(selected) === Number(project.id) ? "selected" : ""}>
      ${esc(project.name)}
    </option>
  `).join("");
}

function openTask(id = null) {
  const old = id === null
    ? null
    : tasks.find(t => Number(t.id) === Number(id));

  if (!projects.length) {
    toast("Create a project first");
    return;
  }

  if (id !== null && !old) {
    toast("Task not found");
    return;
  }

  showModal(old ? "Edit Task" : "Create Task", `
    <div class="form-grid">
      <div class="field full">
        <label>Task Name *</label>
        <input id="fTitle" maxlength="100"
          value="${esc(old?.title || "")}"
          placeholder="Enter task name">
      </div>
      <div class="field">
        <label>Project</label>
        <select id="fProject">
          ${projectOptions(old?.projectId || projects[0].id)}
        </select>
      </div>
      <div class="field">
        <label>Priority</label>
        <select id="fPriority">
          ${["Low", "Medium", "High"].map(x => `
            <option ${old?.priority === x ? "selected" : ""}>${x}</option>
          `).join("")}
        </select>
      </div>
      <div class="field">
        <label>Status</label>
        <select id="fStatus">
          ${["Pending", "In Progress", "Completed"].map(x => `
            <option ${old?.status === x ? "selected" : ""}>${x}</option>
          `).join("")}
        </select>
      </div>
      <div class="field">
        <label>Deadline</label>
        <input id="fDeadline" type="date"
          value="${esc(old?.deadline || "")}">
      </div>
      <div class="field full">
        <label>Description</label>
        <textarea id="fDescription" rows="3">${esc(old?.description || "")}</textarea>
      </div>
    </div>
  `, async () => {
    const title = $("#fTitle").value.trim();

    if (!title) {
      toast("Task name is required");
      return false;
    }

    const payload = {
      title,
      projectId: Number($("#fProject").value),
      priority: $("#fPriority").value,
      status: $("#fStatus").value,
      deadline: $("#fDeadline").value || null
    };

    if (old) {
      await apiRequest("/tasks/" + Number(id), {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    await refresh();
    toast(old ? "Task updated" : "Task created");
  });
}


function bindTaskButtons() {
  $$("[data-edit-task]").forEach(button => {
    button.onclick = () => openTask(Number(button.dataset.editTask));
  });

  $$("[data-undo-task]").forEach(button => {
    button.onclick = () => undoTaskStatus(Number(button.dataset.undoTask));
  });

  $$("[data-delete-task]").forEach(button => {
    button.onclick = () => deleteTask(Number(button.dataset.deleteTask));
  });
}




async function undoTaskStatus(id) {
  if (!confirm("Undo the last status change for this task?")) {
    return;
  }

  try {
    const result = await apiRequest(
      `/tasks/${Number(id)}/undo`,
      { method: "POST" }
    );

    await refresh();
    toast("Status restored to " + result.status);
  } catch (error) {
    showError(error);
  }
}


async function deleteTask(id) {
  const task = tasks.find(t => Number(t.id) === Number(id));

  if (!task || !confirm(`Delete task "${task.title}"?`)) return;

  try {
    await apiRequest("/tasks/" + Number(id), { method: "DELETE" });
    await refresh();
    toast("Task deleted");
  } catch (error) {
    showError(error);
  }
}

function openProject(id = null) {
  const old = id === null
    ? null
    : projects.find(p => Number(p.id) === Number(id));

  if (id !== null && !old) {
    toast("Project not found");
    return;
  }

  showModal(old ? "Edit Project" : "Create Project", `
    <div class="form-grid">
      <div class="field full">
        <label>Project Name *</label>
        <input id="pName" maxlength="100"
          value="${esc(old?.name || "")}"
          placeholder="Enter project name">
      </div>
      <div class="field full">
        <label>Description</label>
        <textarea id="pDescription" rows="3">${esc(old?.description || "")}</textarea>
      </div>
    </div>
  `, async () => {
    const name = $("#pName").value.trim();

    if (!name) {
      toast("Project name is required");
      return false;
    }

    const payload = {
      name,
      description: $("#pDescription").value.trim()
    };

    if (old) {
      await apiRequest("/projects/" + Number(id), {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      await apiRequest("/projects", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    await refresh();
    toast(old ? "Project updated" : "Project created");
  });
}

async function deleteProject(id) {
  if (tasks.some(t => Number(t.projectId) === Number(id))) {
    toast("Delete or move this project's tasks first");
    return;
  }

  const project = projects.find(p => Number(p.id) === Number(id));

  if (!project || !confirm(`Delete project "${project.name}"?`)) return;

  try {
    await apiRequest("/projects/" + Number(id), { method: "DELETE" });
    await refresh();
    toast("Project deleted");
  } catch (error) {
    showError(error);
  }
}

function openDependency() {
  if (tasks.length < 2) {
    toast("Create at least two tasks first");
    return;
  }

  const options = tasks.map(t => `
    <option value="${t.id}">
      ${esc(t.title)} (ID ${t.id})
    </option>
  `).join("");

  showModal("Add Dependency", `
    <div class="form-grid">
      <div class="field full">
        <label>Prerequisite Task</label>
        <select id="dPre">${options}</select>
      </div>
      <div class="field full">
        <label>Dependent Task</label>
        <select id="dDep">${options}</select>
      </div>
    </div>
  `, async () => {
    const prerequisiteId = Number($("#dPre").value);
    const dependentId = Number($("#dDep").value);

    if (prerequisiteId === dependentId) {
      toast("Choose two different tasks");
      return false;
    }

    if (dependencies.some(d =>
      Number(d.prerequisiteId) === prerequisiteId &&
      Number(d.dependentId) === dependentId
    )) {
      toast("This dependency already exists");
      return false;
    }

    await apiRequest("/dependencies", {
      method: "POST",
      body: JSON.stringify({ prerequisiteId, dependentId })
    });

    await refresh();
    toast("Dependency added");
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  navSetup();

  $("#newTaskBtn")?.addEventListener("click", () => openTask());
  $("#quickAddTask")?.addEventListener("click", () => openTask());
  $("#newProjectBtn")?.addEventListener("click", () => openProject());
  $("#addDependencyBtn")?.addEventListener("click", () => openDependency());

  $("#clearHistory")?.addEventListener("click", () => {
    toast("History is stored in MySQL; clearing requires a backend endpoint.");
  });

  await refresh();
});
