#include <stdio.h>

#include <stdlib.h>

#include <string.h>

#include <mysql.h>



#define MAX 100



MYSQL *conn;



/* QUEUE AND STACK NODE */



struct node {

    int data;

    struct node *link;

};



struct node *front = NULL;

struct node *rear = NULL;

struct node *top = NULL;



/* STACK NODE FOR UNDO */



struct stackNode {

    int taskId;

    char oldStatus[20];

    char newStatus[20];

    struct stackNode *link;

};



struct stackNode *undoTop = NULL;



/* BINARY SEARCH TREE */



struct bst {

    int data;

    struct bst *left;

    struct bst *right;

};



struct bst *root = NULL;

/* BST INSERT FUNCTION */

struct bst *insert(struct bst *root, int value)
{
    struct bst *newNode;

    if (root == NULL)
    {
        newNode = (struct bst *)malloc(sizeof(struct bst));

        if (newNode == NULL)
        {
            printf("Memory allocation failed.\n");
            return NULL;
        }

        newNode->data = value;
        newNode->left = NULL;
        newNode->right = NULL;

        return newNode;
    }

    if (value < root->data)
        root->left = insert(root->left, value);
    else if (value > root->data)
        root->right = insert(root->right, value);

    return root;
}

/* BST SEARCH FUNCTION */

struct bst *search(struct bst *root, int value)
{
    if (root == NULL || root->data == value)
        return root;

    if (value < root->data)
        return search(root->left, value);

    return search(root->right, value);
}

/* CLEAR BST FUNCTION */

void clearBST(struct bst *root)
{
    if (root == NULL)
        return;

    clearBST(root->left);
    clearBST(root->right);
    free(root);
}

/* GRAPH */



int vertexCount;

int taskIds[MAX];

int graph[MAX][MAX];



/* DATABASE SETUP */



void setupDatabase()

{

    if (mysql_query(conn,

        "CREATE DATABASE IF NOT EXISTS smart_task_scheduler") != 0) {

        printf("Database error: %s\n", mysql_error(conn));

        exit(1);

    }



    if (mysql_select_db(conn, "smart_task_scheduler") != 0) {

        printf("Database selection error: %s\n", mysql_error(conn));

        exit(1);

    }



    mysql_query(conn,

        "CREATE TABLE IF NOT EXISTS Projects("

        "project_id INT AUTO_INCREMENT PRIMARY KEY,"

        "project_name VARCHAR(100) NOT NULL,"

        "description VARCHAR(255))");



    mysql_query(conn,

        "CREATE TABLE IF NOT EXISTS Tasks("

        "task_id INT AUTO_INCREMENT PRIMARY KEY,"

        "project_id INT NOT NULL,"

        "title VARCHAR(255) NOT NULL,"

        "priority INT DEFAULT 2,"

        "status VARCHAR(20) DEFAULT 'Pending',"

        "deadline DATE,"

        "FOREIGN KEY(project_id) REFERENCES Projects(project_id) "

        "ON DELETE CASCADE)");



    mysql_query(conn,

        "CREATE TABLE IF NOT EXISTS Dependencies("

        "task_id INT NOT NULL,"

        "dependency_id INT NOT NULL,"

        "PRIMARY KEY(task_id,dependency_id),"

        "FOREIGN KEY(task_id) REFERENCES Tasks(task_id) ON DELETE CASCADE,"

        "FOREIGN KEY(dependency_id) REFERENCES Tasks(task_id) ON DELETE CASCADE)");



    mysql_query(conn,

        "CREATE TABLE IF NOT EXISTS Task_History("

        "history_id INT AUTO_INCREMENT PRIMARY KEY,"

        "task_id INT NOT NULL,"

        "old_status VARCHAR(20),"

        "new_status VARCHAR(20),"

        "undone TINYINT NOT NULL DEFAULT 0,"

        "changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"

        "FOREIGN KEY(task_id) REFERENCES Tasks(task_id) ON DELETE CASCADE)");


    /* Add the column to an existing database without deleting any data. */
    if (mysql_query(conn, "SHOW COLUMNS FROM Task_History LIKE 'undone'") == 0) {
        MYSQL_RES *check = mysql_store_result(conn);
        if (check != NULL) {
            if (mysql_num_rows(check) == 0) {
                mysql_free_result(check);
                if (mysql_query(conn,
                    "ALTER TABLE Task_History ADD COLUMN undone TINYINT NOT NULL DEFAULT 0") != 0) {
                    printf("Could not update Task_History schema: %s\n", mysql_error(conn));
                }
            } else {
                mysql_free_result(check);
            }
        }
    }
        MYSQL_RES *res;
    MYSQL_ROW row;

    if (mysql_query(conn,
        "SELECT COUNT(*) FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA='smart_task_scheduler' "
        "AND TABLE_NAME='Task_History' "
        "AND COLUMN_NAME='undone'") == 0)
    {
        res = mysql_store_result(conn);
        row = mysql_fetch_row(res);

        if (row != NULL && atoi(row[0]) == 0)
        {
            mysql_free_result(res);

            if (mysql_query(conn,
                "ALTER TABLE Task_History "
                "ADD COLUMN undone TINYINT NOT NULL DEFAULT 0") != 0)
            {
                printf("History column error: %s\n",
                       mysql_error(conn));
                exit(1);
            }
        }
        else
        {
            mysql_free_result(res);
        }
    }

}



/* CREATE PROJECT */



void createProject()

{

    char name[100], description[255];

    char eName[201], eDescription[511], query[800];



    printf("Enter project name: ");

    scanf(" %99[^\n]", name);



    printf("Enter description: ");

    scanf(" %254[^\n]", description);



    mysql_real_escape_string(conn, eName, name, strlen(name));

    mysql_real_escape_string(conn, eDescription,

                             description, strlen(description));



    snprintf(query, sizeof(query),

        "INSERT INTO Projects(project_name,description) "

        "VALUES('%s','%s')", eName, eDescription);



    if (mysql_query(conn, query) == 0)

        printf("Project created successfully. ID = %llu\n",

               mysql_insert_id(conn));

    else

        printf("Error: %s\n", mysql_error(conn));

}



/* DISPLAY PROJECTS */



void displayProjects()

{

    MYSQL_RES *res;

    MYSQL_ROW row;



    if (mysql_query(conn, "SELECT * FROM Projects") != 0) {

        printf("%s\n", mysql_error(conn));

        return;

    }



    res = mysql_store_result(conn);



    printf("\nID\tProject Name\tDescription\n");



    while ((row = mysql_fetch_row(res)) != NULL)

        printf("%s\t%s\t\t%s\n",

               row[0], row[1], row[2] ? row[2] : "");



    mysql_free_result(res);

}



/* ADD TASK */



void addTask()

{

    int project, priority;

    char title[255], escapedTitle[511];

    char deadline[11], query[800];



    printf("Enter project ID: ");

    scanf("%d", &project);



    printf("Enter task title: ");

    scanf(" %254[^\n]", title);



    printf("Enter priority (1=High, 2=Medium, 3=Low): ");

    scanf("%d", &priority);



    if (priority < 1 || priority > 3) {

        printf("Invalid priority.\n");

        return;

    }



    printf("Enter deadline (YYYY-MM-DD): ");

    scanf("%10s", deadline);



    if (strlen(deadline) != 10 ||

        deadline[4] != '-' || deadline[7] != '-') {

        printf("Invalid date format.\n");

        return;

    }



    mysql_real_escape_string(conn, escapedTitle,

                             title, strlen(title));



    snprintf(query, sizeof(query),

        "INSERT INTO Tasks(project_id,title,priority,status,deadline) "

        "VALUES(%d,'%s',%d,'Pending','%s')",

        project, escapedTitle, priority, deadline);



    if (mysql_query(conn, query) == 0)

        printf("Task added successfully. Task ID = %llu\n",

               mysql_insert_id(conn));

    else

        printf("Error: %s\n", mysql_error(conn));

}



/* DISPLAY TASKS */



void displayTasks()

{

    MYSQL_RES *res;

    MYSQL_ROW row;



    if (mysql_query(conn,

        "SELECT task_id,project_id,title,priority,status,deadline "

        "FROM Tasks ORDER BY task_id") != 0) {

        printf("%s\n", mysql_error(conn));

        return;

    }



    res = mysql_store_result(conn);



    printf("\nID\tProject\tTask\t\t\tPriority\tStatus\tDeadline\n");



    while ((row = mysql_fetch_row(res)) != NULL)

        printf("%s\t%s\t%s\t\t%s\t\t%s\t%s\n",

            row[0], row[1], row[2], row[3], row[4],

            row[5] ? row[5] : "N/A");



    mysql_free_result(res);

}



/* QUEUE: ENQUEUE */



void enqueue(int id)

{

    struct node *newNode;



    newNode = malloc(sizeof(struct node));



    if (newNode == NULL) {

        printf("Memory allocation failed.\n");

        return;

    }



    newNode->data = id;

    newNode->link = NULL;



    if (front == NULL)

        front = rear = newNode;

    else {

        rear->link = newNode;

        rear = newNode;

    }

}



/* QUEUE: DEQUEUE */



int dequeue()

{

    struct node *temp;

    int id;



    if (front == NULL)

        return -1;



    temp = front;

    id = temp->data;



    front = front->link;



    if (front == NULL)

        rear = NULL;



    free(temp);

    return id;

}



/* PENDING TASK QUEUE */



void showPendingQueue()

{

    MYSQL_RES *res;

    MYSQL_ROW row;

    int id;



    while (front != NULL)

        dequeue();



    if (mysql_query(conn,

        "SELECT task_id FROM Tasks "

        "WHERE status='Pending' ORDER BY priority,task_id") != 0) {

        printf("%s\n", mysql_error(conn));

        return;

    }



    res = mysql_store_result(conn);



    while ((row = mysql_fetch_row(res)) != NULL) {

        id = atoi(row[0]);

        enqueue(id);

    }



    mysql_free_result(res);



    printf("\nPending Task Queue:\n");



    if (front == NULL) {

        printf("No pending tasks.\n");

        return;

    }



    while (front != NULL)

        printf("Task ID: %d\n", dequeue());

}



/* STACK: PUSH UNDO INFORMATION */



void pushUndo(int id, char oldStatus[], char newStatus[])

{

    struct stackNode *newNode;



    newNode = malloc(sizeof(struct stackNode));



    if (newNode == NULL) {

        printf("Undo information could not be saved.\n");

        return;

    }



    newNode->taskId = id;

    strcpy(newNode->oldStatus, oldStatus);

    strcpy(newNode->newStatus, newStatus);



    newNode->link = undoTop;

    undoTop = newNode;

}



/* UPDATE TASK STATUS */



void updateTaskStatus()

{

    int id;

    char status[20], oldStatus[20], query[500];

    MYSQL_RES *res;

    MYSQL_ROW row;



    printf("Enter task ID: ");

    scanf("%d", &id);



    snprintf(query, sizeof(query),

        "SELECT status FROM Tasks WHERE task_id=%d", id);



    if (mysql_query(conn, query) != 0) {

        printf("%s\n", mysql_error(conn));

        return;

    }



    res = mysql_store_result(conn);

    row = mysql_fetch_row(res);



    if (row == NULL) {

        printf("Task not found.\n");

        mysql_free_result(res);

        return;

    }



    strcpy(oldStatus, row[0]);

    mysql_free_result(res);



    printf("Enter new status (Pending/In Progress/Completed): ");

    scanf(" %19[^\n]", status);



    if (strcmp(status, "Pending") != 0 &&

        strcmp(status, "In Progress") != 0 &&

        strcmp(status, "Completed") != 0) {

        printf("Invalid status.\n");

        return;

    }



    if (strcmp(oldStatus, status) == 0) {

        printf("Task already has this status.\n");

        return;

    }



    snprintf(query, sizeof(query),

        "UPDATE Tasks SET status='%s' WHERE task_id=%d",

        status, id);



    if (mysql_query(conn, query) != 0) {

        printf("Error: %s\n", mysql_error(conn));

        return;

    }



    snprintf(query, sizeof(query),

        "INSERT INTO Task_History(task_id,old_status,new_status) "

        "VALUES(%d,'%s','%s')", id, oldStatus, status);



    if (mysql_query(conn, query) != 0)

        printf("History error: %s\n", mysql_error(conn));



    pushUndo(id, oldStatus, status);



    printf("Task status updated successfully.\n");

}



/* STACK: POP AND UNDO */



void undoStatus()
{
    MYSQL_RES *res;
    MYSQL_ROW row;
    char query[500];
    int taskId;
    int historyId;
    char oldStatus[30];
    char newStatus[30];

    printf("\nEnter Task ID to undo: ");
    scanf("%d", &taskId);

    snprintf(query, sizeof(query),
        "SELECT history_id, old_status, new_status "
        "FROM Task_History "
        "WHERE task_id=%d AND undone=0 "
        "ORDER BY history_id DESC LIMIT 1",
        taskId);

    if (mysql_query(conn, query) != 0)
    {
        printf("History error: %s\n", mysql_error(conn));
        return;
    }

    res = mysql_store_result(conn);
    row = mysql_fetch_row(res);

    if (row == NULL)
    {
        printf("No unused history available for this task.\n");
        mysql_free_result(res);
        return;
    }

    historyId = atoi(row[0]);
    strcpy(oldStatus, row[1]);
    strcpy(newStatus, row[2]);

    mysql_free_result(res);

    if (mysql_query(conn, "START TRANSACTION") != 0)
    {
        printf("Transaction error: %s\n", mysql_error(conn));
        return;
    }

    snprintf(query, sizeof(query),
        "UPDATE Tasks SET status='%s' "
        "WHERE task_id=%d AND status='%s'",
        oldStatus, taskId, newStatus);

    if (mysql_query(conn, query) != 0 ||
        mysql_affected_rows(conn) == 0)
    {
        mysql_query(conn, "ROLLBACK");
        printf("Undo failed. Check the current task status.\n");
        return;
    }

    snprintf(query, sizeof(query),
        "UPDATE Task_History SET undone=1 "
        "WHERE history_id=%d AND undone=0",
        historyId);

    if (mysql_query(conn, query) != 0 ||
        mysql_affected_rows(conn) == 0)
    {
        mysql_query(conn, "ROLLBACK");
        printf("Could not update history. Undo cancelled.\n");
        return;
    }

    if (mysql_query(conn, "COMMIT") != 0)
    {
        mysql_query(conn, "ROLLBACK");
        printf("Could not save undo operation.\n");
        return;
    }

    printf("\nTask status successfully undone!\n");
    printf("Previous status: %s\n", newStatus);
    printf("Restored status: %s\n", oldStatus);
}


/* VIEW TASK HISTORY */




void showHistory()
{
    int id;
    char query[300];
    MYSQL_RES *res;
    MYSQL_ROW row;

    printf("Enter task ID: ");

    if (scanf("%d", &id) != 1)
    {
        printf("Invalid task ID.\n");
        return;
    }

    sprintf(query,
        "SELECT old_status, new_status, changed_at, undone "
        "FROM Task_History "
        "WHERE task_id = %d "
        "ORDER BY history_id", id);

    if (mysql_query(conn, query) != 0)
    {
        printf("Error: %s\n", mysql_error(conn));
        return;
    }

    res = mysql_store_result(conn);

    if (res == NULL)
    {
        printf("Error reading history: %s\n", mysql_error(conn));
        return;
    }

    printf("\n%-15s %-15s %-22s %-15s\n",
           "Old Status", "New Status",
           "Changed At", "Undo Status");

    printf("--------------------------------------------------------------------------\n");

    while ((row = mysql_fetch_row(res)) != NULL)
    {
        printf("%-15s %-15s %-22s %-15s\n",
               row[0] ? row[0] : "",
               row[1] ? row[1] : "",
               row[2] ? row[2] : "",
               (row[3] != NULL && strcmp(row[3], "1") == 0)
                   ? "Undone" : "Available");
    }

    mysql_free_result(res);
}



/* SEARCH TASK USING BST */



void searchTask()

{

    MYSQL_RES *res;

    MYSQL_ROW row;

    int id;

    char query[300];



    clearBST(root);

    root = NULL;



    if (mysql_query(conn, "SELECT task_id FROM Tasks") != 0) {

        printf("%s\n", mysql_error(conn));

        return;

    }



    res = mysql_store_result(conn);



    while ((row = mysql_fetch_row(res)) != NULL)

        root = insert(root, atoi(row[0]));



    mysql_free_result(res);



    printf("Enter task ID to search: ");

    scanf("%d", &id);



    if (search(root, id) == NULL) {

        printf("Task not found.\n");

        return;

    }



    snprintf(query, sizeof(query),

        "SELECT task_id,title,status,priority,deadline "

        "FROM Tasks WHERE task_id=%d", id);



    mysql_query(conn, query);

    res = mysql_store_result(conn);

    row = mysql_fetch_row(res);



    if (row != NULL)

        printf("\nTask ID: %s\nTitle: %s\nStatus: %s\n"

               "Priority: %s\nDeadline: %s\n",

            row[0], row[1], row[2], row[3],

            row[4] ? row[4] : "N/A");



    mysql_free_result(res);

}



/* BUILD GRAPH FROM DATABASE */



int findIndex(int id, int n)

{

    int i;



    for (i = 0; i < n; i++)

        if (taskIds[i] == id)

            return i;



    return -1;

}



int buildGraph()

{

    MYSQL_RES *res;

    MYSQL_ROW row;

    int i, from, to, a, b;



    vertexCount = 0;



    for (i = 0; i < MAX; i++) {

        taskIds[i] = 0;



        for (int j = 0; j < MAX; j++)

            graph[i][j] = 0;

    }



    if (mysql_query(conn, "SELECT task_id FROM Tasks ORDER BY task_id") != 0)

        return 0;



    res = mysql_store_result(conn);



    while ((row = mysql_fetch_row(res)) != NULL && vertexCount < MAX)

        taskIds[vertexCount++] = atoi(row[0]);



    mysql_free_result(res);



    if (mysql_query(conn,

        "SELECT dependency_id,task_id FROM Dependencies") != 0)

        return vertexCount;



    res = mysql_store_result(conn);



    while ((row = mysql_fetch_row(res)) != NULL) {

        from = atoi(row[0]);

        to = atoi(row[1]);



        a = findIndex(from, vertexCount);

        b = findIndex(to, vertexCount);



        if (a != -1 && b != -1)

            graph[a][b] = 1;

    }



    mysql_free_result(res);

    return vertexCount;

}



/* GRAPH: DFS HELPER FOR CYCLE CHECK */



int pathExists(int start, int target, int n, int visited[])

{

    int i;



    if (start == target)

        return 1;



    visited[start] = 1;



    for (i = 0; i < n; i++) {

        if (graph[start][i] && !visited[i]) {

            if (pathExists(i, target, n, visited))

                return 1;

        }

    }



    return 0;

}



/* ADD TASK DEPENDENCY */



void addDependency()

{

    int task, dependency, n, taskIndex, depIndex;

    int visited[MAX] = {0};

    char query[300];



    printf("Enter task ID: ");

    scanf("%d", &task);



    printf("Enter prerequisite task ID: ");

    scanf("%d", &dependency);



    if (task == dependency) {

        printf("A task cannot depend on itself.\n");

        return;

    }



    n = buildGraph();



    taskIndex = findIndex(task, n);

    depIndex = findIndex(dependency, n);



    if (taskIndex == -1 || depIndex == -1) {

        printf("Task ID not found.\n");

        return;

    }



    if (graph[depIndex][taskIndex]) {

        printf("This dependency already exists.\n");

        return;

    }



    /* Adding dependency -> task creates a cycle

       if task can already reach dependency. */



    if (pathExists(taskIndex, depIndex, n, visited)) {

        printf("Dependency rejected: it would create a cycle.\n");

        return;

    }



    snprintf(query, sizeof(query),

        "INSERT INTO Dependencies(task_id,dependency_id) "

        "VALUES(%d,%d)", task, dependency);



    if (mysql_query(conn, query) == 0)

        printf("Dependency added successfully.\n");

    else

        printf("Error: %s\n", mysql_error(conn));

}



/* DISPLAY DEPENDENCIES */



void showDependencies()

{

    MYSQL_RES *res;

    MYSQL_ROW row;



    if (mysql_query(conn,

        "SELECT dependency_id,task_id FROM Dependencies ORDER BY task_id") != 0) {

        printf("%s\n", mysql_error(conn));

        return;

    }



    res = mysql_store_result(conn);



    printf("\nPrerequisite Task -> Dependent Task\n");



    while ((row = mysql_fetch_row(res)) != NULL)

        printf("%s -> %s\n", row[0], row[1]);



    mysql_free_result(res);

}



/* GRAPH: BFS */



void BFS()

{

    int start, startIndex, i;

    int visited[MAX] = {0};

    int queue[MAX], f = 0, r = 0, current;



    int n = buildGraph();



    printf("Enter starting task ID: ");

    scanf("%d", &start);



    startIndex = findIndex(start, n);



    if (startIndex == -1) {

        printf("Task not found.\n");

        return;

    }



    queue[r++] = startIndex;

    visited[startIndex] = 1;



    printf("BFS: ");



    while (f < r) {

        current = queue[f++];

        printf("%d ", taskIds[current]);



        for (i = 0; i < n; i++) {

            if (graph[current][i] && !visited[i]) {

                queue[r++] = i;

                visited[i] = 1;

            }

        }

    }



    printf("\n");

}



/* GRAPH: DFS HELPER */



void DFSvisit(int current, int n, int visited[])

{

    int i;



    visited[current] = 1;

    printf("%d ", taskIds[current]);



    for (i = 0; i < n; i++) {

        if (graph[current][i] && !visited[i])

            DFSvisit(i, n, visited);

    }

}



/* GRAPH: DFS */



void DFS()

{

    int start, startIndex;

    int visited[MAX] = {0};

    int n = buildGraph();



    printf("Enter starting task ID: ");

    scanf("%d", &start);



    startIndex = findIndex(start, n);



    if (startIndex == -1) {

        printf("Task not found.\n");

        return;

    }



    printf("DFS: ");

    DFSvisit(startIndex, n, visited);

    printf("\n");

}



/* TOPOLOGICAL SORT */



void topologicalSort()

{

    int indegree[MAX] = {0};

    int queue[MAX];

    int f = 0, r = 0;

    int i, j, current, count = 0;

    int n = buildGraph();



    for (i = 0; i < n; i++)

        for (j = 0; j < n; j++)

            if (graph[i][j])

                indegree[j]++;



    for (i = 0; i < n; i++)

        if (indegree[i] == 0)

            queue[r++] = i;



    printf("\nTask Execution Order: ");



    while (f < r) {

        current = queue[f++];

        printf("%d ", taskIds[current]);

        count++;



        for (j = 0; j < n; j++) {

            if (graph[current][j]) {

                indegree[j]--;



                if (indegree[j] == 0)

                    queue[r++] = j;

            }

        }

    }



    if (count != n)

        printf("\nCycle detected. Topological sort is not possible.");



    printf("\n");

}



/* DELETE TASK */



void deleteTask()

{

    int id;

    char query[200];



    printf("Enter task ID to delete: ");

    scanf("%d", &id);



    snprintf(query, sizeof(query),

        "DELETE FROM Tasks WHERE task_id=%d", id);



    if (mysql_query(conn, query) == 0) {

        if (mysql_affected_rows(conn) > 0)

            printf("Task deleted successfully.\n");

        else

            printf("Task not found.\n");

    } else {

        printf("Error: %s\n", mysql_error(conn));

    }

}



/* MAIN */



int main()

{

    int choice;

    char password[100];



    printf("Enter your local MySQL root password: ");

    scanf("%99s", password);



    conn = mysql_init(NULL);



    if (conn == NULL) {

        printf("MySQL initialization failed.\n");

        return 1;

    }



    if (mysql_real_connect(conn, "localhost", "root", password,

                           NULL, 3306, NULL, 0) == NULL) {

        printf("Connection failed: %s\n", mysql_error(conn));

        mysql_close(conn);

        return 1;

    }



    setupDatabase();



    printf("\nDatabase and tables are ready!\n");



    do {

        printf("\n===== SMART TASK SCHEDULER =====\n");

        printf("1. Create Project\n");

        printf("2. Display Projects\n");

        printf("3. Add Task\n");

        printf("4. Display Tasks\n");

        printf("5. Update Task Status\n");

        printf("6. View Task History\n");

        printf("7. Delete Task\n");

        printf("8. Show Pending Task Queue\n");

        printf("9. Undo Last Status Change\n");

        printf("10. Search Task using BST\n");

        printf("11. Add Task Dependency\n");

        printf("12. Display Dependencies\n");

        printf("13. Topological Sort\n");

        printf("14. BFS\n");

        printf("15. DFS\n");

        printf("16. Exit\n");

        printf("Enter your choice: ");



        if (scanf("%d", &choice) != 1)

            break;



        switch (choice) {

            case 1:

                createProject();

                break;



            case 2:

                displayProjects();

                break;



            case 3:

                addTask();

                break;



            case 4:

                displayTasks();

                break;



            case 5:

                updateTaskStatus();

                break;



            case 6:

                showHistory();

                break;



            case 7:

                deleteTask();

                break;



            case 8:

                showPendingQueue();

                break;



            case 9:

                undoStatus();

                break;



            case 10:

                searchTask();

                break;



            case 11:

                addDependency();

                break;



            case 12:

                showDependencies();

                break;



            case 13:

                topologicalSort();

                break;



            case 14:

                BFS();

                break;



            case 15:

                DFS();

                break;



            case 16:

                printf("Exiting project.\n");

                break;



            default:

                printf("Invalid choice.\n");

        }



    } while (choice != 16);



    clearBST(root);



    while (undoTop != NULL) {

        struct stackNode *temp = undoTop;

        undoTop = undoTop->link;

        free(temp);

    }



    while (front != NULL)

        dequeue();



    mysql_close(conn);



    return 0;

}