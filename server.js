
require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "smart_task_scheduler",
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10
});

function asyncRoute(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}




function priorityToNumber(priority) {
    if (priority === "Low") return 1;
    if (priority === "High") return 3;
    return 2;
}

function numberToPriority(priority) {
    return ({ 1: "Low", 2: "Medium", 3: "High" })[Number(priority)] || "Medium";
}

function formatTask(task) {
    return {
        id: task.task_id,
        projectId: task.project_id,
        title: task.title,
        priority: numberToPriority(task.priority),
        status: task.status || "Pending",
        deadline: task.deadline
            ? new Date(task.deadline).toISOString().slice(0, 10)
            : "",
        description: ""
    };
}

function formatProject(project) {
    return {
        id: project.project_id,
        name: project.project_name,
        description: project.description || "",
        createdAt: null
    };
}

async function addHistory(taskId, oldStatus, newStatus) {
    await pool.execute(
        `INSERT INTO Task_History (task_id, old_status, new_status)
         VALUES (?, ?, ?)`,
        [taskId, oldStatus, newStatus]
    );
}

app.get("/api/health", asyncRoute(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ success: true, message: "API and MySQL connected" });
}));

app.get("/api/dashboard", asyncRoute(async (req, res) => {
    const [projects] = await pool.query("SELECT COUNT(*) AS total FROM Projects");
    const [tasks] = await pool.query("SELECT COUNT(*) AS total FROM Tasks");
    const [completed] = await pool.query(
        "SELECT COUNT(*) AS total FROM Tasks WHERE status = 'Completed'"
    );
    const [pending] = await pool.query(
        "SELECT COUNT(*) AS total FROM Tasks WHERE status = 'Pending'"
    );
    const [progress] = await pool.query(
        "SELECT COUNT(*) AS total FROM Tasks WHERE status = 'In Progress'"
    );

    res.json({
        projects: projects[0].total,
        tasks: tasks[0].total,
        completed: completed[0].total,
        pending: pending[0].total,
        inProgress: progress[0].total
    });
}));

app.get("/api/projects", asyncRoute(async (req, res) => {
    const [rows] = await pool.query(
        "SELECT project_id, project_name, description FROM Projects ORDER BY project_id DESC"
    );
    res.json(rows.map(formatProject));
}));

app.post("/api/projects", asyncRoute(async (req, res) => {
    const { name, description = "" } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: "Project name is required" });
    }

    const [result] = await pool.execute(
        "INSERT INTO Projects (project_name, description) VALUES (?, ?)",
        [name.trim(), description.trim() || null]
    );

    res.status(201).json({
        id: result.insertId,
        name: name.trim(),
        description: description.trim(),
        createdAt: null
    });
}));

app.put("/api/projects/:id", asyncRoute(async (req, res) => {
    const { name, description = "" } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: "Project name is required" });
    }

    const [result] = await pool.execute(
        "UPDATE Projects SET project_name = ?, description = ? WHERE project_id = ?",
        [name.trim(), description.trim() || null, req.params.id]
    );

    if (!result.affectedRows) {
        return res.status(404).json({ error: "Project not found" });
    }

    res.json({ success: true });
}));

app.delete("/api/projects/:id", asyncRoute(async (req, res) => {
    const [tasks] = await pool.execute(
        "SELECT task_id FROM Tasks WHERE project_id = ? LIMIT 1",
        [req.params.id]
    );

    if (tasks.length) {
        return res.status(409).json({
            error: "Delete or move this project's tasks first"
        });
    }

    const [result] = await pool.execute(
        "DELETE FROM Projects WHERE project_id = ?",
        [req.params.id]
    );

    if (!result.affectedRows) {
        return res.status(404).json({ error: "Project not found" });
    }

    res.json({ success: true });
}));

app.get("/api/tasks", asyncRoute(async (req, res) => {
    const [rows] = await pool.query(
        "SELECT task_id, project_id, title, priority, status, deadline FROM Tasks ORDER BY task_id DESC"
    );
    res.json(rows.map(formatTask));
}));

app.post("/api/tasks", asyncRoute(async (req, res) => {
    const {
        title,
        projectId,
        priority = "Medium",
        status = "Pending",
        deadline = ""
    } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: "Task name is required" });
    }

    if (!projectId) {
        return res.status(400).json({ error: "Project is required" });
    }

    const [result] = await pool.execute(
        `INSERT INTO Tasks (project_id, title, priority, status, deadline)
         VALUES (?, ?, ?, ?, ?)`,
        [
            Number(projectId),
            title.trim(),
            priorityToNumber(priority),
            status,
            deadline || null
        ]
    );

    await addHistory(result.insertId, null, status);

    res.status(201).json({
        id: result.insertId,
        projectId: Number(projectId),
        title: title.trim(),
        priority,
        status,
        deadline: deadline || "",
        description: ""
    });
}));

app.put("/api/tasks/:id", asyncRoute(async (req, res) => {
    const {
        title,
        projectId,
        priority = "Medium",
        status = "Pending",
        deadline = ""
    } = req.body;

    if (!title || !title.trim() || !projectId) {
        return res.status(400).json({
            error: "Task name and project are required"
        });
    }

    const [existing] = await pool.execute(
        "SELECT status FROM Tasks WHERE task_id = ?",
        [req.params.id]
    );

    if (!existing.length) {
        return res.status(404).json({ error: "Task not found" });
    }

    const oldStatus = existing[0].status;

    await pool.execute(
        `UPDATE Tasks
         SET project_id = ?, title = ?, priority = ?, status = ?, deadline = ?
         WHERE task_id = ?`,
        [
            Number(projectId),
            title.trim(),
            priorityToNumber(priority),
            status,
            deadline || null,
            req.params.id
        ]
    );

    if (oldStatus !== status) {
        await addHistory(Number(req.params.id), oldStatus, status);
    }

    res.json({ success: true });
}));

app.delete("/api/tasks/:id", asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            "SELECT title FROM Tasks WHERE task_id = ?",
            [id]
        );

        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ error: "Task not found" });
        }

        await connection.execute(
            "DELETE FROM Dependencies WHERE task_id = ? OR dependency_id = ?",
            [id, id]
        );

        await connection.execute(
            "DELETE FROM Task_History WHERE task_id = ?",
            [id]
        );

        await connection.execute(
            "DELETE FROM Tasks WHERE task_id = ?",
            [id]
        );

        await connection.commit();

        res.json({ success: true, title: rows[0].title });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}));

app.get("/api/dependencies", asyncRoute(async (req, res) => {
    const [rows] = await pool.query(
        "SELECT task_id, dependency_id FROM Dependencies"
    );

    res.json(rows.map(row => ({
        id: `${row.task_id}-${row.dependency_id}`,
        prerequisiteId: row.task_id,
        dependentId: row.dependency_id
    })));
}));

app.post("/api/dependencies", asyncRoute(async (req, res) => {
    const prerequisiteId = Number(req.body.prerequisiteId);
    const dependentId = Number(req.body.dependentId);

    if (!prerequisiteId || !dependentId || prerequisiteId === dependentId) {
        return res.status(400).json({
            error: "Choose two different valid tasks"
        });
    }

    const [tasks] = await pool.execute(
        "SELECT task_id FROM Tasks WHERE task_id IN (?, ?)",
        [prerequisiteId, dependentId]
    );

    if (tasks.length !== 2) {
        return res.status(400).json({ error: "Both tasks must exist" });
    }

    const [existing] = await pool.execute(
        "SELECT task_id FROM Dependencies WHERE task_id = ? AND dependency_id = ?",
        [prerequisiteId, dependentId]
    );

    if (existing.length) {
        return res.status(409).json({ error: "Dependency already exists" });
    }

    await pool.execute(
        "INSERT INTO Dependencies (task_id, dependency_id) VALUES (?, ?)",
        [prerequisiteId, dependentId]
    );

    res.status(201).json({ success: true });
}));

app.delete("/api/dependencies/:prerequisiteId/:dependentId", asyncRoute(async (req, res) => {
    await pool.execute(
        "DELETE FROM Dependencies WHERE task_id = ? AND dependency_id = ?",
        [req.params.prerequisiteId, req.params.dependentId]
    );

    res.json({ success: true });
}));


app.delete("/api/dependencies/:id", asyncRoute(async (req, res) => {
    const parts = req.params.id.split("-");
    const prerequisiteId = Number(parts[0]);
    const dependentId = Number(parts[1]);

    if (!prerequisiteId || !dependentId) {
        return res.status(400).json({ error: "Invalid dependency ID" });
    }

    const [result] = await pool.execute(
        "DELETE FROM Dependencies WHERE task_id = ? AND dependency_id = ?",
        [prerequisiteId, dependentId]
    );

    if (!result.affectedRows) {
        return res.status(404).json({ error: "Dependency not found" });
    }

    res.json({ success: true });
}));

app.post("/api/tasks/:id/undo", asyncRoute(async (req, res) => {
    const taskId = Number(req.params.id);
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [tasks] = await connection.execute(
            "SELECT task_id FROM Tasks WHERE task_id = ? FOR UPDATE",
            [taskId]
        );

        if (!tasks.length) {
            await connection.rollback();
            return res.status(404).json({ error: "Task not found" });
        }

        const [history] = await connection.execute(
            `SELECT history_id, old_status
             FROM Task_History
             WHERE task_id = ?
               AND old_status IS NOT NULL
               AND undone = 0
             ORDER BY history_id DESC
             LIMIT 1
             FOR UPDATE`,
            [taskId]
        );

        if (!history.length) {
            await connection.rollback();
            return res.status(404).json({
                error: "No status change available to undo"
            });
        }

        const change = history[0];

        await connection.execute(
            "UPDATE Tasks SET status = ? WHERE task_id = ?",
            [change.old_status, taskId]
        );

        await connection.execute(
            "UPDATE Task_History SET undone = 1 WHERE history_id = ?",
            [change.history_id]
        );

        await connection.commit();

        res.json({
            success: true,
            status: change.old_status
        });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}));

app.get("/api/history", asyncRoute(async (req, res) => {
    const [rows] = await pool.query(
        `SELECT history_id, task_id, old_status, new_status, changed_at, undone
         FROM Task_History
         ORDER BY history_id DESC
         LIMIT 100`
    );

    res.json(rows.map(row => ({
        id: row.history_id,
        taskId: row.task_id,
        action: row.old_status === null
            ? "Task created"
            : "Task status changed",
        detail: row.old_status === null
            ? `Task ${row.task_id}: ${row.new_status}`
            : `Task ${row.task_id}: ${row.old_status} → ${row.new_status}`,
        at: row.changed_at,
        undone: Boolean(row.undone)
    })));
}));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({
        error: "Server error. Check the terminal for details."
    });
});

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
    try {
        await pool.query("SELECT 1");
        console.log("MySQL connected successfully.");
        app.listen(PORT, () => {
            console.log(`Smart Task Scheduler running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exit(1);
    }
}

startServer();
