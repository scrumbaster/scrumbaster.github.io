(function (global) {
  const STORAGE_KEY = "db";

  function getCurrentDate() {
    if (typeof global.CurrentDate !== "undefined") {
      return global.CurrentDate;
    }

    return new Date();
  }

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

    const now = getCurrentDate();
    const todayString = formatDateToString(now);
    const storedDate = stored.settings.CURDATE && stored.settings.CURDATE.val ? stored.settings.CURDATE.val : null;
    const currentHour = now.getHours();

    if (storedDate === todayString) {
      return { success: true, skipped: true, reason: "already_rescheduled", date: todayString };
    }

    if (currentHour < 6) {
      return { success: true, skipped: true, reason: "before_6am", date: todayString };
    }

    const updatedTaskNames = [];
    const deletedTaskNames = [];
    const insertedTaskNames = [];
    const processedDates = [];
    const dailyResults = [];

    function addUnique(list, taskName) {
      if (list.indexOf(taskName) === -1) {
        list.push(taskName);
      }
    }

    function parseLocalDate(dateString) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || "")) {
        return null;
      }

      const parts = dateString.split("-").map(Number);
      const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
      if (date.getFullYear() !== parts[0]
        || date.getMonth() !== parts[1] - 1
        || date.getDate() !== parts[2]) {
        return null;
      }
      return date;
    }

    let processingDate = parseLocalDate(storedDate);
    if (processingDate && storedDate < todayString) {
      processingDate.setDate(processingDate.getDate() + 1);
    } else {
      processingDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    }

    while (formatDateToString(processingDate) <= todayString) {
      const processingDateString = formatDateToString(processingDate);
      const previousDate = new Date(processingDate.getTime());
      previousDate.setDate(previousDate.getDate() - 1);
      const previousDateString = formatDateToString(previousDate);
      const dayResult = {
        date: processingDateString,
        updatedTaskNames: [],
        deletedTaskNames: [],
        insertedTaskNames: []
      };

      stored.settings.CURDATE = { val: processingDateString };

      Object.keys(stored.task_todo).forEach(function (taskName) {
        const task = stored.task_todo[taskName];
        if (task && task.lud === processingDateString) {
          task.lud = previousDateString;
          dayResult.updatedTaskNames.push(taskName);
          addUnique(updatedTaskNames, taskName);
        }
      });

      Object.keys(stored.task_template).forEach(function (taskName) {
        const template = stored.task_template[taskName];
        const todoItem = stored.task_todo[taskName];
        if (template && todoItem && todoItem.lud) {
          template.lcd = todoItem.lud;
        }
      });

      Object.keys(stored.task_todo).forEach(function (taskName) {
        const task = stored.task_todo[taskName];
        if (task && Number(task.tc) === 5) {
          delete stored.task_todo[taskName];
          dayResult.deletedTaskNames.push(taskName);
          addUnique(deletedTaskNames, taskName);
        }
      });

      const existingTaskNames = Object.keys(stored.task_todo);
      Object.keys(stored.task_template).forEach(function (taskName) {
        const template = stored.task_template[taskName];
        if (!template || existingTaskNames.indexOf(taskName) !== -1) {
          return;
        }

        let shouldInsert = false;

        if (template.tt === "DaysFromPrev") {
          const difference = getDaysDifference(template.lcd, processingDateString);
          shouldInsert = difference !== null && difference >= Number(template.int);
        } else if (template.tt === "Yearly") {
          const monthDay = Number(processingDateString.slice(5, 7)) * 100
            + Number(processingDateString.slice(8, 10));
          shouldInsert = monthDay === Number(template.int);
        } else if (template.tt === "Monthly") {
          shouldInsert = Number(processingDateString.slice(8, 10)) === Number(template.int);
        } else if (template.tt === "Weekly") {
          shouldInsert = processingDate.getDay() + 1 === Number(template.int);
        }

        if (shouldInsert) {
          stored.task_todo[taskName] = { lud: processingDateString, tc: 0 };
          existingTaskNames.push(taskName);
          dayResult.insertedTaskNames.push(taskName);
          addUnique(insertedTaskNames, taskName);
        }
      });

      processedDates.push(processingDateString);
      dailyResults.push(dayResult);
      processingDate.setDate(processingDate.getDate() + 1);
    }

    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    return {
      success: true,
      skipped: false,
      date: todayString,
      updatedTaskNames,
      deletedTaskNames,
      insertedTaskNames,
      processedDates,
      dailyResults
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

  function isIosSafari() {
    const userAgent = global.navigator && global.navigator.userAgent ? global.navigator.userAgent : "";
    const platform = global.navigator && global.navigator.platform ? global.navigator.platform : "";
    const isIosDevice = /iP(ad|hone|od)/.test(userAgent)
      || (platform === "MacIntel" && global.navigator && global.navigator.maxTouchPoints > 1);
    return isIosDevice && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
  }

  function openTextFallback(content) {
    const openedWindow = global.open("", "_blank");
    if (!openedWindow) {
      throw new Error("Popup was blocked. Allow popups or use Safari share/save options.");
    }

    openedWindow.document.open();
    openedWindow.document.write("<!DOCTYPE html><html><head><title>data.js</title><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head><body><pre style=\"white-space:pre-wrap;word-break:break-word;\"></pre></body></html>");
    openedWindow.document.close();
    openedWindow.document.querySelector("pre").textContent = content;
  }

  function downloadLocalStorageAsDataJs() {
    const dataToDownload = getLocalStorageDataForDownload();
    const content = "window.data = " + JSON.stringify(dataToDownload, null, 2) + ";\n";
    const blob = new Blob([content], { type: "application/javascript" });

    if (isIosSafari()) {
      if (global.navigator
        && typeof global.navigator.canShare === "function"
        && typeof global.navigator.share === "function"
        && typeof global.File === "function") {
        const file = new File([blob], "data.js", { type: "application/javascript" });
        try {
          if (global.navigator.canShare({ files: [file] })) {
            return global.navigator.share({
              files: [file],
              title: "data.js"
            }).then(function () {
              return dataToDownload;
            }).catch(function () {
              openTextFallback(content);
              return dataToDownload;
            });
          }
        } catch (error) {
          openTextFallback(content);
          return Promise.resolve(dataToDownload);
        }
      }

      openTextFallback(content);
      return Promise.resolve(dataToDownload);
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "data.js";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    global.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

    return Promise.resolve(dataToDownload);
  }

  function stripTrailingCommas(jsonText) {
    let result = "";
    let inString = false;
    let escaped = false;

    for (let i = 0; i < jsonText.length; i++) {
      const char = jsonText.charAt(i);

      if (inString) {
        result += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        result += char;
        continue;
      }

      if (char === ",") {
        let nextIndex = i + 1;
        while (/\s/.test(jsonText.charAt(nextIndex))) {
          nextIndex++;
        }
        if (jsonText.charAt(nextIndex) === "}" || jsonText.charAt(nextIndex) === "]") {
          continue;
        }
      }

      result += char;
    }

    return result;
  }

  function parseDataJsContent(content) {
    let jsonText = (content || "").trim();
    const assignmentPatterns = [
      /^window\.data\s*=\s*/i,
      /^globalThis\.data\s*=\s*/i,
      /^var\s+data\s*=\s*/i,
      /^let\s+data\s*=\s*/i,
      /^const\s+data\s*=\s*/i,
      /^data\s*=\s*/i
    ];

    for (let i = 0; i < assignmentPatterns.length; i++) {
      if (assignmentPatterns[i].test(jsonText)) {
        jsonText = jsonText.replace(assignmentPatterns[i], "");
        break;
      }
    }

    jsonText = jsonText.replace(/;\s*$/, "");
    return JSON.parse(stripTrailingCommas(jsonText));
  }

  function uploadLocalStorageFromDataJs() {
    if (!global.localStorage) {
      return Promise.reject(new Error("Local storage is not available in this browser."));
    }

    if (!global.FileReader) {
      return Promise.reject(new Error("File reading is not available in this browser."));
    }

    return new Promise(function (resolve, reject) {
      const input = document.createElement("input");

      input.type = "file";
      input.accept = ".js,text/javascript,application/javascript,text/plain,application/json";
      input.style.position = "fixed";
      input.style.left = "0";
      input.style.top = "0";
      input.style.width = "1px";
      input.style.height = "1px";
      input.style.opacity = "0";
      input.style.pointerEvents = "none";

      input.addEventListener("change", function () {
        const file = input.files && input.files[0];

        document.body.removeChild(input);

        if (!file) {
          resolve({ success: false, cancelled: true });
          return;
        }

        if (!/^data(?:\s*\(\d+\))?\.js$/i.test(file.name)) {
          reject(new Error("Please select data.js or a downloaded copy such as data(1).js."));
          return;
        }

        const reader = new FileReader();
        reader.onload = function () {
          try {
            const importedData = parseDataJsContent(reader.result);
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(importedData));
            resolve({ success: true, key: STORAGE_KEY, fileName: file.name, data: importedData });
          } catch (error) {
            reject(new Error("Selected file is not a valid data.js file: " + error.message));
          }
        };
        reader.onerror = function () {
          reject(new Error("Could not read selected file."));
        };
        reader.readAsText(file);
      });

      document.body.appendChild(input);
      input.click();
    });
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

    const today = getCurrentDate().toISOString().slice(0, 10);
    stored.task_todo[taskName] = Object.assign({}, stored.task_todo[taskName] || { lud: today, tc: 0 }, {
      lud: today,
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

    const today = getCurrentDate().toISOString().slice(0, 10);
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
    getCurrentDate,
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
    updateTaskCompletion,
    addTaskToTodo,
    addTemplate,
    deleteTask,
    deleteTemplate,
    getLocalStorageDataForDownload,
    downloadLocalStorageAsDataJs,
    uploadLocalStorageFromDataJs
  };

  global.saveDataToLocalStorage = saveDataToLocalStorage;
  global.getCurrentDate = getCurrentDate;
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
  global.updateTaskCompletion = updateTaskCompletion;
  global.addTaskToTodo = addTaskToTodo;
  global.addTemplate = addTemplate;
  global.deleteTask = deleteTask;
  global.deleteTemplate = deleteTemplate;
  global.getLocalStorageDataForDownload = getLocalStorageDataForDownload;
  global.downloadLocalStorageAsDataJs = downloadLocalStorageAsDataJs;
  global.uploadLocalStorageFromDataJs = uploadLocalStorageFromDataJs;
})(window);
