(function (global) {
  const STORAGE_KEY = "db";

  function getSourceData() {
    if (typeof global.data !== "undefined") {
      return global.data;
    }
    if (global.window && typeof global.window.data !== "undefined") {
      return global.window.data;
    }
    return null;
  }

  function saveDataToLocalStorage() {
    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    const sourceData = getSourceData();
    if (!sourceData) {
      throw new Error("The data.js script was not loaded.");
    }

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(sourceData));
    return { success: true, key: STORAGE_KEY };
  }

  function loadFromLocalStorage() {
    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    const raw = global.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error("Stored data is not valid JSON: " + error.message);
    }
  }

  function clearLocalStorage() {
    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    global.localStorage.removeItem(STORAGE_KEY);
    return { success: true, key: STORAGE_KEY, cleared: true };
  }

  function getTaskTemplateOnly() {
    const stored = loadFromLocalStorage();
    if (!stored || !stored.task_template) {
      return [];
    }

    return Object.keys(stored.task_template).map(function (taskName) {
      return { task_name: taskName };
    });
  }

  function saveDateToLocalStorage(dateValue) {
    if (!dateValue) {
      throw new Error("A date value is required.");
    }

    const stored = loadFromLocalStorage() || {};
    if (!stored.settings) {
      stored.settings = {};
    }

    stored.settings.CURDATE = { val: dateValue };

    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return { success: true, key: STORAGE_KEY, CURDATE: dateValue };
  }

  function readDateFromLocalStorage() {
    const stored = loadFromLocalStorage();
    if (!stored || !stored.settings || !stored.settings.CURDATE) {
      return null;
    }

    return stored.settings.CURDATE.val;
  }

  function formatDateToString(dateValue) {
    return new Date(dateValue).toISOString().slice(0, 10);
  }

  function getDaysDifference(startDate, endDate) {
    if (!startDate || !endDate) {
      return null;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    return Math.round((end - start) / (1000 * 60 * 60 * 24));
  }

  function taskReschedule() {
    const stored = ensureStorageInitialized();
    if (!stored || typeof stored !== "object") {
      throw new Error("No data available to reschedule.");
    }

    if (!stored.settings) {
      stored.settings = {};
    }

    if (!stored.task_todo) {
      stored.task_todo = {};
    }

    if (!stored.task_template) {
      stored.task_template = {};
    }

    const now = new Date();
    const todayString = formatDateToString(now);
    const storedDate = stored.settings.CURDATE && stored.settings.CURDATE.val ? stored.settings.CURDATE.val : null;
    const currentHour = now.getHours();

    if (storedDate === todayString) {
      return { success: true, skipped: true, reason: "already_rescheduled", date: todayString };
    }

    if (currentHour < 6) {
      return { success: true, skipped: true, reason: "before_6am", date: todayString };
    }

    const yesterdayDate = new Date(now);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayString = formatDateToString(yesterdayDate);

    stored.settings.CURDATE = { val: todayString };

    const updatedTaskNames = [];
    Object.keys(stored.task_todo).forEach(function (taskName) {
      const task = stored.task_todo[taskName];
      if (task && task.lud === todayString) {
        task.lud = yesterdayString;
        updatedTaskNames.push(taskName);
      }
    });

    Object.keys(stored.task_template).forEach(function (taskName) {
      const template = stored.task_template[taskName];
      const todoItem = stored.task_todo[taskName];
      if (template && todoItem && todoItem.lud) {
        template.lcd = todoItem.lud;
      }
    });

    const deletedTaskNames = [];
    Object.keys(stored.task_todo).forEach(function (taskName) {
      const task = stored.task_todo[taskName];
      if (task && Number(task.tc) === 5) {
        delete stored.task_todo[taskName];
        deletedTaskNames.push(taskName);
      }
    });

    const insertedTaskNames = [];
    const existingTaskNames = Object.keys(stored.task_todo);

    Object.keys(stored.task_template).forEach(function (taskName) {
      const template = stored.task_template[taskName];
      if (!template || existingTaskNames.indexOf(taskName) !== -1) {
        return;
      }

      if (template.tt === "DaysFromPrev") {
        const difference = getDaysDifference(template.lcd, todayString);
        if (difference !== null && difference > Number(template.int)) {
          stored.task_todo[taskName] = { lud: todayString, tc: 0 };
          existingTaskNames.push(taskName);
          insertedTaskNames.push(taskName);
        }
        return;
      }

      if (template.tt === "Yearly") {
        const monthDay = Number(todayString.slice(5, 7)) * 100 + Number(todayString.slice(8, 10));
        if (monthDay === Number(template.int)) {
          stored.task_todo[taskName] = { lud: todayString, tc: 0 };
          existingTaskNames.push(taskName);
          insertedTaskNames.push(taskName);
        }
        return;
      }

      if (template.tt === "Monthly") {
        const dayOfMonth = Number(todayString.slice(8, 10));
        if (dayOfMonth === Number(template.int)) {
          stored.task_todo[taskName] = { lud: todayString, tc: 0 };
          existingTaskNames.push(taskName);
          insertedTaskNames.push(taskName);
        }
        return;
      }

      if (template.tt === "Weekly") {
        const dayOfWeek = now.getDay() + 1;
        if (dayOfWeek === Number(template.int)) {
          stored.task_todo[taskName] = { lud: todayString, tc: 0 };
          existingTaskNames.push(taskName);
          insertedTaskNames.push(taskName);
        }
      }
    });

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    return {
      success: true,
      skipped: false,
      date: todayString,
      updatedTaskNames,
      deletedTaskNames,
      insertedTaskNames
    };
  }

  function task_reschecule() {
    return taskReschedule();
  }

  function checkDailyTrigger() {
    // taskReschedule performs the once-per-day check itself. Calling it on
    // every page load also allows a page opened before 6am to try again later.
    return taskReschedule();
  }

  function getLocalStorageDataForDownload() {
    const stored = loadFromLocalStorage();
    if (stored !== null) {
      return stored;
    }

    const sourceData = getSourceData();
    return sourceData || {};
  }

  function ensureStorageInitialized() {
    const stored = loadFromLocalStorage();
    if (stored !== null) {
      return stored;
    }

    const sourceData = getSourceData();
    if (sourceData) {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(sourceData));
      return sourceData;
    }

    return null;
  }

  function getTaskItemsForUi() {
    const stored = ensureStorageInitialized();
    if (!stored || !stored.task_todo) {
      return [];
    }

    return Object.keys(stored.task_todo).map(function (taskName) {
      const completionValue = stored.task_todo[taskName].tc;
      return {
        task_name: taskName,
        task_completed: Number.isFinite(Number(completionValue)) ? Number(completionValue) : 0
      };
    }).sort(function (a, b) {
      const completionOrder = b.task_completed - a.task_completed;
      if (completionOrder !== 0) {
        return completionOrder;
      }

      return a.task_name.localeCompare(b.task_name);
    });
  }

  function getTaskTemplatesInfo() {
    const stored = ensureStorageInitialized();
    if (!stored || !stored.task_template) {
      return [];
    }

    return Object.keys(stored.task_template).map(function (taskName) {
      const template = stored.task_template[taskName] || {};
      return {
        task_name: taskName,
        info: [template.tt, template.int].filter(function (value) {
          return value !== undefined && value !== null && value !== "";
        }).join(" / ")
      };
    });
  }

  function replaceTasksFromMigration(todoRows, templateRows) {
    if (!Array.isArray(todoRows) || !Array.isArray(templateRows)) {
      throw new Error("Migration data must contain todo and template lists.");
    }

    const taskTodo = {};
    todoRows.forEach(function (row) {
      if (!row || typeof row.task_name !== "string" || !row.task_name.trim()) {
        throw new Error("A migrated todo row is missing task_name.");
      }

      const completionValue = row.task_completed !== undefined
        ? row.task_completed
        : row.tc;
      const parsedCompletion = Number(completionValue);

      if (!Number.isFinite(parsedCompletion)) {
        throw new Error("Invalid task_completed value for " + row.task_name + ".");
      }

      taskTodo[row.task_name] = {
        lud: row.last_updated_date || row.lud || null,
        tc: parsedCompletion
      };
    });

    const taskTemplate = {};
    templateRows.forEach(function (row) {
      if (!row || typeof row.task_name !== "string" || !row.task_name.trim()) {
        throw new Error("A migrated template row is missing task_name.");
      }

      const intervalValue = row.interval !== undefined ? row.interval : row.int;
      const parsedInterval = Number(intervalValue);

      if (!Number.isFinite(parsedInterval)) {
        throw new Error("Invalid interval value for " + row.task_name + ".");
      }

      taskTemplate[row.task_name] = {
        int: parsedInterval,
        lcd: row.last_completed_date || row.lcd || null,
        tt: row.task_type || row.tt || ""
      };
    });

    const stored = ensureStorageInitialized() || {};
    stored.task_todo = taskTodo;
    stored.task_template = taskTemplate;
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    return {
      success: true,
      todoCount: Object.keys(taskTodo).length,
      templateCount: Object.keys(taskTemplate).length
    };
  }

  function updateTaskCompletion(taskName, completionValue) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    const stored = ensureStorageInitialized();
    if (!stored || typeof stored !== "object") {
      throw new Error("No data available to update.");
    }

    if (!stored.task_todo) {
      stored.task_todo = {};
    }

    const today = new Date().toISOString().slice(0, 10);
    stored.task_todo[taskName] = Object.assign({}, stored.task_todo[taskName] || { lud: today, tc: 0 }, {
      lud: stored.task_todo[taskName] && stored.task_todo[taskName].lud ? stored.task_todo[taskName].lud : today,
      tc: Number(completionValue)
    });

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return getTaskItemsForUi();
  }

  function addTaskToTodo(taskName) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    const stored = loadFromLocalStorage() || getSourceData() || {};
    if (!stored || typeof stored !== "object") {
      throw new Error("No data available to update.");
    }

    if (!stored.task_todo) {
      stored.task_todo = {};
    }

    const today = new Date().toISOString().slice(0, 10);
    stored.task_todo[taskName] = { lud: today, tc: 0 };

    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return { success: true, taskName, lud: today, tc: 0 };
  }

  function addTemplate(taskName, intervalValue, taskType, currentDate) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    if (typeof intervalValue === "undefined" || intervalValue === null || intervalValue === "") {
      throw new Error("An interval value is required.");
    }

    if (!taskType) {
      throw new Error("A task type is required.");
    }

    if (!currentDate) {
      throw new Error("A current date is required.");
    }

    const stored = loadFromLocalStorage() || getSourceData() || {};
    if (!stored || typeof stored !== "object") {
      throw new Error("No data available to update.");
    }

    if (!stored.task_template) {
      stored.task_template = {};
    }

    const intValue = Number(intervalValue);
    stored.task_template[taskName] = {
      int: intValue,
      lcd: currentDate,
      tt: taskType
    };

    if (!global.localStorage) {
      throw new Error("Local storage is not available in this browser.");
    }

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return { success: true, taskName, int: intValue, lcd: currentDate, tt: taskType };
  }

  function deleteTask(taskName) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    const stored = loadFromLocalStorage();
    if (!stored || !stored.task_todo) {
      return [];
    }

    if (stored.task_todo[taskName]) {
      delete stored.task_todo[taskName];
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }

    const rows = Object.keys(stored.task_todo).map(function (name) {
      return { task_name: name };
    });

    rows.sort(function (a, b) {
      return a.task_name.localeCompare(b.task_name);
    });

    return rows;
  }

  function deleteTemplate(taskName) {
    if (!taskName) {
      throw new Error("A task name is required.");
    }

    const stored = loadFromLocalStorage();
    if (!stored) {
      return [];
    }

    if (stored.task_template && stored.task_template[taskName]) {
      delete stored.task_template[taskName];
    }

    if (stored.task_todo && stored.task_todo[taskName]) {
      delete stored.task_todo[taskName];
    }

    if (stored.task_template || stored.task_todo) {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }

    const rows = Object.keys(stored.task_todo || {}).map(function (name) {
      return { task_name: name };
    });

    rows.sort(function (a, b) {
      return a.task_name.localeCompare(b.task_name);
    });

    return rows;
  }

  global.DataAccess = {
    STORAGE_KEY,
    saveDataToLocalStorage,
    loadFromLocalStorage,
    clearLocalStorage,
    getTaskTemplateOnly,
    saveDateToLocalStorage,
    readDateFromLocalStorage,
    taskReschedule,
    task_reschecule,
    checkDailyTrigger,
    ensureStorageInitialized,
    getTaskItemsForUi,
    getTaskTemplatesInfo,
    replaceTasksFromMigration,
    updateTaskCompletion,
    addTaskToTodo,
    addTemplate,
    deleteTask,
    deleteTemplate,
    getLocalStorageDataForDownload
  };

  global.saveDataToLocalStorage = saveDataToLocalStorage;
  global.loadFromLocalStorage = loadFromLocalStorage;
  global.clearLocalStorage = clearLocalStorage;
  global.getTaskTemplateOnly = getTaskTemplateOnly;
  global.saveDateToLocalStorage = saveDateToLocalStorage;
  global.readDateFromLocalStorage = readDateFromLocalStorage;
  global.taskReschedule = taskReschedule;
  global.task_reschedule = taskReschedule;
  global.task_reschecule = task_reschecule;
  global.checkDailyTrigger = checkDailyTrigger;
  global.ensureStorageInitialized = ensureStorageInitialized;
  global.getTaskItemsForUi = getTaskItemsForUi;
  global.getTaskTemplatesInfo = getTaskTemplatesInfo;
  global.replaceTasksFromMigration = replaceTasksFromMigration;
  global.updateTaskCompletion = updateTaskCompletion;
  global.addTaskToTodo = addTaskToTodo;
  global.addTemplate = addTemplate;
  global.deleteTask = deleteTask;
  global.deleteTemplate = deleteTemplate;
  global.getLocalStorageDataForDownload = getLocalStorageDataForDownload;
})(window);
