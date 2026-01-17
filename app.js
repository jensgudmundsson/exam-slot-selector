const ADMIN_PASSWORD = "1518";

const defaultData = {
  dates: [],
  slots: [],
  users: [],
  preferences: {},
  allocation: {
    order: [],
    assignments: {},
  },
};

const dayLabelMap = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

const userIdInput = document.getElementById("userIdInput");
const availabilitySelect = document.getElementById("availabilitySelect");
const preferredDayField = document.getElementById("preferredDayField");
const preferredDaySelect = document.getElementById("preferredDaySelect");
const timePreferenceSelect = document.getElementById("timePreferenceSelect");
const generateListButton = document.getElementById("generateListButton");
const resetListButton = document.getElementById("resetListButton");
const preferenceList = document.getElementById("preferenceList");
const savePreferencesButton = document.getElementById("savePreferencesButton");
const savePreferencesRow = document.getElementById("savePreferencesRow");
const saveStatus = document.getElementById("saveStatus");

const dateInput = document.getElementById("dateInput");
const addDateButton = document.getElementById("addDateButton");
const dateList = document.getElementById("dateList");

const slotTimeInput = document.getElementById("slotTimeInput");
const addSlotButton = document.getElementById("addSlotButton");
const slotList = document.getElementById("slotList");

const userIdAdminInput = document.getElementById("userIdAdminInput");
const addUserButton = document.getElementById("addUserButton");
const userList = document.getElementById("userList");

const runAllocationButton = document.getElementById("runAllocationButton");
const clearAllocationButton = document.getElementById("clearAllocationButton");
const randomOrderList = document.getElementById("randomOrderList");
const allocationResults = document.getElementById("allocationResults");
const allocationStatus = document.getElementById("allocationStatus");

let currentPreferenceList = [];
let hasSavedPreferences = false;
let appData = structuredClone(defaultData);
let isAdminAuthenticated = false;
let hasLoadedData = false;

const supabaseUrl = window.SUPABASE_URL;
const supabaseKey = window.SUPABASE_ANON_KEY;
const supabaseClient = supabaseUrl && supabaseKey
  ? window.supabase.createClient(supabaseUrl, supabaseKey)
  : null;

const ensureSupabase = () => {
  if (!supabaseClient) {
    setStatus("Supabase is not configured. Update config.js with your keys.");
    throw new Error("Supabase not configured");
  }
};

const getDayKeyFromDate = (dateValue) => {
  if (!dateValue) return "";
  const dateObj = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(dateObj.getTime())) {
    return "";
  }
  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return dayKeys[dateObj.getDay()];
};

const getStartMinutesFromLabel = (label) => {
  if (!label) return null;
  return parseTimeString(label);
};

const parseTimeString = (value) => {
  const match = value.match(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
  if (!match) return null;
  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const meridiem = match[3] ? match[3].toLowerCase() : null;

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours === 12) {
      hours = meridiem === "am" ? 0 : 12;
    } else if (meridiem === "pm") {
      hours += 12;
    }
  }

  if (hours < 0 || hours > 23) return null;
  return hours * 60 + minutes;
};

const parseRangeToSlots = (rangeText) => {
  const parts = rangeText.split("-").map((part) => part.trim());
  if (parts.length !== 2) return [];
  const start = parseTimeString(parts[0]);
  const end = parseTimeString(parts[1]);
  if (start === null || end === null || end <= start) return [];

  const slots = [];
  for (let minutes = start; minutes + 20 <= end; minutes += 20) {
    slots.push(formatMinutes(minutes));
  }
  return slots;
};

const formatMinutes = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const paddedHours = String(hours).padStart(2, "0");
  const paddedMins = String(mins).padStart(2, "0");
  return `${paddedHours}:${paddedMins}`;
};

const getPeriodFromLabel = (label) => {
  const minutes = getStartMinutesFromLabel(label);
  if (minutes === null) return "before";
  return minutes > 12 * 60 + 30 ? "after" : "before";
};

const normalizeData = (data) => {
  data.dates = data.dates.map((date) => ({
    ...date,
    day: getDayKeyFromDate(date.date) || date.day || "",
  }));

  data.slots = data.slots.map((slot) => ({
    ...slot,
    period: getPeriodFromLabel(slot.label),
  }));

  return data;
};

const fetchDates = async () => {
  ensureSupabase();
  const { data, error } = await supabaseClient
    .from("dates")
    .select("id, date, day")
    .order("date", { ascending: true });
  if (error) throw error;
  return data || [];
};

const fetchSlots = async () => {
  ensureSupabase();
  const { data, error } = await supabaseClient
    .from("slots")
    .select("id, label, period")
    .order("label", { ascending: true });
  if (error) throw error;
  return data || [];
};

const fetchUsers = async () => {
  ensureSupabase();
  const { data, error } = await supabaseClient
    .from("users")
    .select("id")
    .order("id", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => row.id);
};

const fetchPreferences = async () => {
  ensureSupabase();
  const { data, error } = await supabaseClient
    .from("preferences")
    .select("user_id, slot_id, rank")
    .order("rank", { ascending: true });
  if (error) throw error;
  const preferences = {};
  (data || []).forEach((row) => {
    if (!preferences[row.user_id]) {
      preferences[row.user_id] = [];
    }
    preferences[row.user_id].push({ slotId: row.slot_id, rank: row.rank });
  });
  Object.keys(preferences).forEach((userId) => {
    preferences[userId] = preferences[userId]
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.slotId);
  });
  return preferences;
};

const fetchLatestAllocation = async () => {
  ensureSupabase();
  const { data: runData, error: runError } = await supabaseClient
    .from("allocation")
    .select("run_id")
    .order("run_id", { ascending: false })
    .limit(1);
  if (runError) throw runError;
  if (!runData || runData.length === 0) {
    return { order: [], assignments: {} };
  }
  const latestRunId = runData[0].run_id;
  const { data, error } = await supabaseClient
    .from("allocation")
    .select("user_id, slot_id, order_index")
    .eq("run_id", latestRunId)
    .order("order_index", { ascending: true });
  if (error) throw error;
  const order = [];
  const assignments = {};
  (data || []).forEach((row) => {
    order.push(row.user_id);
    assignments[row.user_id] = row.slot_id || null;
  });
  return { order, assignments };
};

const refreshData = async () => {
  const [dates, slots, users, preferences, allocation] = await Promise.all([
    fetchDates(),
    fetchSlots(),
    fetchUsers(),
    fetchPreferences(),
    fetchLatestAllocation(),
  ]);
  appData = normalizeData({
    ...structuredClone(defaultData),
    dates,
    slots,
    users,
    preferences,
    allocation,
  });
  hasLoadedData = true;
  return appData;
};

const ensureDataLoaded = async () => {
  if (!hasLoadedData) {
    await refreshData();
  }
  return appData;
};

const getAllSlots = (data) => {
  const slots = [];
  data.dates.forEach((date, dateIndex) => {
    data.slots.forEach((slot, slotIndex) => {
      const period = slot.period || getPeriodFromLabel(slot.label);
      slots.push({
        id: `${date.id}-${slot.id}`,
        dateId: date.id,
        slotId: slot.id,
        day: date.day,
        dateLabel: date.date,
        timeLabel: slot.label,
        period,
        orderKey: dateIndex * 1000 + slotIndex,
      });
    });
  });
  return slots;
};

const renderTagList = (listElement, items, labelBuilder, onRemove) => {
  listElement.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "tag-item";
    li.textContent = labelBuilder(item);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.innerHTML = "&times;";
    removeButton.addEventListener("click", () => onRemove(item.id));
    li.appendChild(removeButton);
    listElement.appendChild(li);
  });
};

const refreshAdminLists = () => {
  const data = appData;

  renderTagList(
    dateList,
    data.dates,
    (item) => `${dayLabelMap[item.day] || item.day} • ${item.date}`,
    async (id) => {
      ensureSupabase();
      await supabaseClient.from("dates").delete().eq("id", id);
      await refreshData();
      refreshAdminLists();
      refreshUserOptions();
    }
  );

  renderTagList(
    slotList,
    data.slots,
    (item) => item.label,
    async (id) => {
      ensureSupabase();
      await supabaseClient.from("slots").delete().eq("id", id);
      await supabaseClient.from("preferences").delete().eq("slot_id", id);
      await refreshData();
      refreshAdminLists();
      refreshUserOptions();
    }
  );

  renderTagList(
    userList,
    data.users.map((user) => ({ id: user })),
    (item) => item.id,
    async (id) => {
      ensureSupabase();
      await supabaseClient.from("users").delete().eq("id", id);
      await supabaseClient.from("preferences").delete().eq("user_id", id);
      await refreshData();
      refreshAdminLists();
      refreshUserOptions();
    }
  );
};

const getAvailableDayOptions = (data) => {
  const seen = new Set();
  return data.dates
    .filter((date) => date.day)
    .filter((date) => {
      if (seen.has(date.day)) return false;
      seen.add(date.day);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((date) => ({
      dayKey: date.day,
      dateLabel: date.date,
    }));
};

const refreshUserOptions = () => {
  const data = appData;
  const availableDays = getAvailableDayOptions(data);
  const currentAvailability = availabilitySelect.value;
  const currentPreferredDay = preferredDaySelect.value;

  availabilitySelect.innerHTML = "";

  if (availableDays.length) {
    if (availableDays.length >= 2) {
      const everyOption = document.createElement("option");
      everyOption.value = "every";
      everyOption.textContent = "Every day";
      availabilitySelect.appendChild(everyOption);
    }

    availableDays.forEach((dayInfo) => {
      const option = document.createElement("option");
      option.value = dayInfo.dayKey;
      option.textContent = `Only ${dayLabelMap[dayInfo.dayKey] || dayInfo.dayKey} ${
        dayInfo.dateLabel
      }`;
      availabilitySelect.appendChild(option);
    });
  }

  preferredDaySelect.innerHTML = "";
  const preferredPlaceholder = document.createElement("option");
  preferredPlaceholder.value = "";
  preferredPlaceholder.disabled = true;
  preferredPlaceholder.selected = true;
  preferredPlaceholder.textContent = "Select one";
  preferredDaySelect.appendChild(preferredPlaceholder);

  availableDays.forEach((dayInfo) => {
    const option = document.createElement("option");
    option.value = dayInfo.dayKey;
    option.textContent = `${dayLabelMap[dayInfo.dayKey] || dayInfo.dayKey} ${
      dayInfo.dateLabel
    }`;
    preferredDaySelect.appendChild(option);
  });

  if ([...availabilitySelect.options].some((opt) => opt.value === currentAvailability)) {
    availabilitySelect.value = currentAvailability;
  } else if (availableDays.length >= 2) {
    availabilitySelect.value = "every";
  } else {
    availabilitySelect.value = "";
  }
  if ([...preferredDaySelect.options].some((opt) => opt.value === currentPreferredDay)) {
    preferredDaySelect.value = currentPreferredDay;
  } else {
    preferredDaySelect.value = "";
  }

  if (availabilitySelect.value === "every" && availableDays.length >= 2) {
    preferredDayField.classList.remove("hidden");
  } else {
    preferredDayField.classList.add("hidden");
    preferredDaySelect.value = "";
  }
};

const formatSlotLabel = (slot) => {
  const dayLabel = dayLabelMap[slot.day] || slot.day;
  return `${dayLabel} ${slot.dateLabel} • ${slot.timeLabel}`;
};

const renderPreferenceList = () => {
  preferenceList.innerHTML = "";
  currentPreferenceList.forEach((slot, index) => {
    const li = document.createElement("li");
    li.className = "sortable-item";
    li.setAttribute("draggable", "true");
    li.dataset.id = slot.id;

    const content = document.createElement("div");
    content.className = "sortable-content";
    content.innerHTML = `<span class="drag-handle">☰</span>${formatSlotLabel(slot)}`;

    const actions = document.createElement("div");
    actions.className = "sortable-actions";

    const mobileControls = document.createElement("div");
    mobileControls.className = "mobile-controls";

    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.textContent = "↑";
    upButton.addEventListener("click", () => moveSlot(index, -1));

    const downButton = document.createElement("button");
    downButton.type = "button";
    downButton.textContent = "↓";
    downButton.addEventListener("click", () => moveSlot(index, 1));

    mobileControls.appendChild(upButton);
    mobileControls.appendChild(downButton);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "remove-button";
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => removeSlot(slot.id));

    actions.appendChild(mobileControls);
    actions.appendChild(removeButton);

    li.appendChild(content);
    li.appendChild(actions);
    preferenceList.appendChild(li);
  });
};

const updateSaveButton = () => {
  if (hasSavedPreferences) {
    savePreferencesButton.textContent = "Preferences saved!";
    savePreferencesButton.classList.remove("primary");
    savePreferencesButton.classList.add("success");
  } else {
    savePreferencesButton.textContent = "Save preferences?";
    savePreferencesButton.classList.remove("success");
    savePreferencesButton.classList.add("primary");
  }
};

const setStatus = (message) => {
  if (message) {
    saveStatus.textContent = message;
    saveStatus.classList.remove("hidden");
  } else {
    saveStatus.textContent = "";
    saveStatus.classList.add("hidden");
  }
};

const formatSupabaseError = (error) => {
  if (!error) return "Unknown error";
  const code = error.code ? ` (${error.code})` : "";
  return `${error.message || "Supabase error"}${code}`;
};

const unlockUserIdField = () => {
  userIdInput.readOnly = false;
  userIdInput.classList.remove("input-locked");
};

const lockUserIdField = () => {
  userIdInput.readOnly = true;
  userIdInput.classList.add("input-locked");
};

const validateAndMaybeLockUserId = async () => {
  try {
    await ensureDataLoaded();
    const data = appData;
    const userId = userIdInput.value.trim();
    if (!userId) {
      unlockUserIdField();
      return;
    }
    if (data.users.includes(userId)) {
      lockUserIdField();
    } else {
      unlockUserIdField();
    }
  } catch (error) {
    unlockUserIdField();
  }
};

const showSaveControls = (isVisible) => {
  if (isVisible) {
    savePreferencesRow.classList.remove("hidden");
  } else {
    savePreferencesRow.classList.add("hidden");
  }
};

const markPreferencesDirty = () => {
  if (hasSavedPreferences) {
    hasSavedPreferences = false;
    updateSaveButton();
  }
};

const moveSlot = (index, direction) => {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= currentPreferenceList.length) {
    return;
  }
  const updated = [...currentPreferenceList];
  const [item] = updated.splice(index, 1);
  updated.splice(newIndex, 0, item);
  currentPreferenceList = updated;
  renderPreferenceList();
  markPreferencesDirty();
};

const removeSlot = (id) => {
  currentPreferenceList = currentPreferenceList.filter((slot) => slot.id !== id);
  renderPreferenceList();
  markPreferencesDirty();
};

const setupDragAndDrop = () => {
  let draggedId = null;

  preferenceList.addEventListener("dragstart", (event) => {
    const target = event.target.closest(".sortable-item");
    if (!target) return;
    draggedId = target.dataset.id;
    event.dataTransfer.effectAllowed = "move";
  });

  preferenceList.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  preferenceList.addEventListener("drop", (event) => {
    event.preventDefault();
    const target = event.target.closest(".sortable-item");
    if (!target || !draggedId) return;
    const targetId = target.dataset.id;
    if (targetId === draggedId) return;

    const updated = [...currentPreferenceList];
    const fromIndex = updated.findIndex((slot) => slot.id === draggedId);
    const toIndex = updated.findIndex((slot) => slot.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    currentPreferenceList = updated;
    renderPreferenceList();
    markPreferencesDirty();
  });

  preferenceList.addEventListener("dragend", () => {
    draggedId = null;
  });
};

const generatePreferenceList = async () => {
  try {
    await refreshData();
  } catch (error) {
    setStatus("Unable to load data. Check Supabase configuration.");
    return;
  }
  const data = appData;
  const userId = userIdInput.value.trim();
  const availability = availabilitySelect.value;
  const preferredDay = preferredDaySelect.value;
  const timePreference = timePreferenceSelect.value;

  if (!userId) {
    setStatus("Please enter your user ID.");
    return;
  }
  if (!data.users.includes(userId)) {
    setStatus("User ID not recognized. Please check with admin.");
    return;
  }
  if (!availability) {
    setStatus("Please select your availability.");
    return;
  }

  const allSlots = getAllSlots(data);
  if (!allSlots.length) {
    setStatus("No slots available yet. Ask admin to add dates and slots.");
    currentPreferenceList = [];
    renderPreferenceList();
    showSaveControls(false);
    return;
  }

  let filtered = allSlots;
  if (availability !== "every") {
    filtered = allSlots.filter((slot) => slot.day === availability);
  }

  if (!filtered.length) {
    currentPreferenceList = [];
    renderPreferenceList();
    setStatus("No slots match your availability choices.");
    showSaveControls(false);
    return;
  }

  const ranked = filtered
    .map((slot) => ({
      slot,
      randomTie: Math.random(),
    }))
    .sort((a, b) => {
      if (availability === "every" && preferredDay) {
        const dayRankA = a.slot.day !== preferredDay ? 1 : 0;
        const dayRankB = b.slot.day !== preferredDay ? 1 : 0;
        if (dayRankA !== dayRankB) return dayRankA - dayRankB;
      }

      if (timePreference) {
        const timeRankA = a.slot.period !== timePreference ? 1 : 0;
        const timeRankB = b.slot.period !== timePreference ? 1 : 0;
        if (timeRankA !== timeRankB) return timeRankA - timeRankB;
      }

      if (a.randomTie !== b.randomTie) return a.randomTie - b.randomTie;
      return a.slot.orderKey - b.slot.orderKey;
    })
    .map((entry) => entry.slot);

  currentPreferenceList = ranked;
  renderPreferenceList();
  setStatus("");
  lockUserIdField();
  hasSavedPreferences = false;
  updateSaveButton();
  showSaveControls(true);
};

const resetPreferenceList = () => {
  generatePreferenceList();
};

const saveUserPreferencesToSupabase = async (userId, slotIds) => {
  ensureSupabase();
  const uniqueSlotIds = [...new Set(slotIds)];
  const { error: deleteError } = await supabaseClient
    .from("preferences")
    .delete()
    .eq("user_id", userId);
  if (deleteError) {
    throw new Error(`Delete failed: ${formatSupabaseError(deleteError)}`);
  }
  const rows = uniqueSlotIds.map((slotId, index) => ({
    user_id: userId,
    slot_id: slotId,
    rank: index + 1,
  }));
  if (rows.length) {
    const { error } = await supabaseClient.from("preferences").insert(rows);
    if (error) {
      throw new Error(`Insert failed: ${formatSupabaseError(error)}`);
    }
  }
};

const savePreferences = async () => {
  await ensureDataLoaded();
  const data = appData;
  const userId = userIdInput.value.trim();
  if (!userId) {
    setStatus("Please enter your user ID.");
    return;
  }
  if (!data.users.includes(userId)) {
    setStatus("User ID not recognized. Please check with admin.");
    return;
  }
  if (!currentPreferenceList.length) {
    setStatus("Your preference list is empty.");
    return;
  }

  try {
    await saveUserPreferencesToSupabase(
      userId,
      currentPreferenceList.map((slot) => slot.id)
    );
    await refreshData();
    setStatus("");
    hasSavedPreferences = true;
    updateSaveButton();
  } catch (error) {
    setStatus(`Failed to save preferences. ${error.message || ""}`.trim());
  }
};

const loadUserPreferences = async () => {
  try {
    await refreshData();
  } catch (error) {
    setStatus("Unable to load data. Check Supabase configuration.");
    return;
  }
  const data = appData;
  const userId = userIdInput.value.trim();
  if (!userId || !data.preferences[userId]) {
    return;
  }
  const slotLookup = new Map(getAllSlots(data).map((slot) => [slot.id, slot]));
  const list = data.preferences[userId]
    .map((slotId) => slotLookup.get(slotId))
    .filter(Boolean);
  if (list.length) {
    currentPreferenceList = list;
    renderPreferenceList();
    setStatus("");
    hasSavedPreferences = true;
    updateSaveButton();
    showSaveControls(true);
  }
};

const runAllocation = async () => {
  await refreshData();
  const data = appData;

  const users = [...data.users];
  const allSlots = getAllSlots(data);

  if (!users.length) {
    allocationStatus.textContent = "Add user IDs before running allocation.";
    return;
  }
  if (!allSlots.length) {
    allocationStatus.textContent = "Add dates and slots before running allocation.";
    return;
  }

  const shuffledUsers = shuffle(users);
  const availableSlots = new Set(allSlots.map((slot) => slot.id));
  const assignments = {};

  shuffledUsers.forEach((userId) => {
    const prefs = (data.preferences[userId] || []).filter((slotId) =>
      availableSlots.has(slotId)
    );
    if (prefs.length) {
      const assigned = prefs[0];
      assignments[userId] = assigned;
      availableSlots.delete(assigned);
    } else {
      assignments[userId] = null;
    }
  });

  try {
    const runId = Date.now();
    const rows = shuffledUsers.map((userId, index) => ({
      run_id: runId,
      user_id: userId,
      slot_id: assignments[userId],
      order_index: index + 1,
    }));
    ensureSupabase();
    if (rows.length) {
      const { error } = await supabaseClient.from("allocation").insert(rows);
      if (error) throw error;
    }
    await refreshData();
    renderAllocation();
    allocationStatus.textContent = "Allocation complete.";
  } catch (error) {
    allocationStatus.textContent = "Allocation failed. Please try again.";
  }
};

const renderAllocation = () => {
  const data = appData;
  const slotLookup = new Map(getAllSlots(data).map((slot) => [slot.id, slot]));

  randomOrderList.innerHTML = "";
  data.allocation.order.forEach((userId) => {
    const li = document.createElement("li");
    li.textContent = userId;
    randomOrderList.appendChild(li);
  });

  allocationResults.innerHTML = "";
  Object.entries(data.allocation.assignments).forEach(([userId, slotId]) => {
    const row = document.createElement("tr");
    const userCell = document.createElement("td");
    userCell.textContent = userId;
    const slotCell = document.createElement("td");
    slotCell.textContent = slotId && slotLookup.get(slotId)
      ? formatSlotLabel(slotLookup.get(slotId))
      : "Unassigned";
    row.appendChild(userCell);
    row.appendChild(slotCell);
    allocationResults.appendChild(row);
  });
};

const clearAllocation = async () => {
  ensureSupabase();
  await supabaseClient.from("allocation").delete().neq("run_id", 0);
  await refreshData();
  renderAllocation();
  allocationStatus.textContent = "Allocation cleared.";
};

const shuffle = (items) => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.tab === "admin" && !isAdminAuthenticated) {
      const attempt = window.prompt("Enter admin password:");
      if (attempt !== ADMIN_PASSWORD) {
        return;
      }
      isAdminAuthenticated = true;
    }

    tabButtons.forEach((tab) => {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    });
    tabPanels.forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    button.setAttribute("aria-selected", "true");
    const target = document.getElementById(button.dataset.tab);
    target.classList.add("active");
  });
});

availabilitySelect.addEventListener("change", () => {
  if (availabilitySelect.value === "every") {
    preferredDayField.classList.remove("hidden");
  } else {
    preferredDayField.classList.add("hidden");
    preferredDaySelect.value = "";
  }
});

generateListButton.addEventListener("click", () => {
  generatePreferenceList();
});
resetListButton.addEventListener("click", resetPreferenceList);
savePreferencesButton.addEventListener("click", () => {
  savePreferences();
});
userIdInput.addEventListener("change", () => {
  loadUserPreferences();
});
userIdInput.addEventListener("blur", () => {
  validateAndMaybeLockUserId();
});
userIdInput.addEventListener("input", unlockUserIdField);

addDateButton.addEventListener("click", async () => {
  ensureSupabase();
  const dateValue = dateInput.value;
  const dayValue = getDayKeyFromDate(dateValue);
  if (!dateValue || !dayValue) return;
  const { error } = await supabaseClient.from("dates").insert({
    id: `date-${Date.now()}`,
    date: dateValue,
    day: dayValue,
  });
  if (error) {
    setStatus("Failed to add date. Please try again.");
    return;
  }
  dateInput.value = "";
  await refreshData();
  refreshAdminLists();
  refreshUserOptions();
});

addSlotButton.addEventListener("click", async () => {
  ensureSupabase();
  const rangeValue = slotTimeInput.value.trim();
  if (!rangeValue) return;
  const slotLabels = parseRangeToSlots(rangeValue);
  if (!slotLabels.length) return;
  const baseId = Date.now();
  const rows = slotLabels.map((label, index) => ({
    id: `slot-${baseId}-${index}`,
    label,
    period: getPeriodFromLabel(label),
  }));
  const { error } = await supabaseClient.from("slots").insert(rows);
  if (error) {
    setStatus("Failed to add slots. Please try again.");
    return;
  }
  slotTimeInput.value = "";
  await refreshData();
  refreshAdminLists();
  refreshUserOptions();
});

addUserButton.addEventListener("click", async () => {
  ensureSupabase();
  const raw = userIdAdminInput.value.trim();
  if (!raw) return;
  const userIds = raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (!userIds.length) return;
  const rows = userIds.map((userId) => ({ id: userId }));
  const { error } = await supabaseClient.from("users").upsert(rows, {
    onConflict: "id",
  });
  if (error) {
    setStatus("Failed to add user IDs. Please try again.");
    return;
  }
  userIdAdminInput.value = "";
  await refreshData();
  refreshAdminLists();
  refreshUserOptions();
});

runAllocationButton.addEventListener("click", () => {
  runAllocation();
});
clearAllocationButton.addEventListener("click", () => {
  clearAllocation();
});

const initializeApp = async () => {
  try {
    await refreshData();
    refreshAdminLists();
    refreshUserOptions();
    renderAllocation();
    setupDragAndDrop();
    updateSaveButton();
    showSaveControls(false);
    setStatus("");
    userIdInput.focus();
  } catch (error) {
    setStatus("Unable to load data. Check Supabase configuration.");
  }
};

initializeApp();
