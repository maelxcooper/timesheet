
// ===== 1. SETUP =====
const STORAGE_KEY = "timesheet-v1";
const DAILY_GOAL = 480;   // 8 hours, in minutes
const MAX_SHOWN = 50;     // how many entries to display
const DATE_FORMAT = { weekday: "short", month: "short", day: "numeric", year: "numeric" };

// All entries live here, grouped by date: { "2026-10-13": [ {d, p, s, e}, ... ] }
// d = description, p = project, s = start time, e = end time
let data = {};
try {
  data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
} catch {
  data = {};
}

const $ = (id) => document.getElementById(id);   // shortcut for finding an element
const save = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
};

// ===== 2. SMALL HELPER FUNCTIONS =====
// Date -> "2026-10-13"
const toIsoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// "2026-10-13" -> "Tue, Oct 13, 2026"
const prettyDate = (iso) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, DATE_FORMAT);

// Minutes between two times like "15:00" and "15:15" (an end before the start counts as next day)
const minutesBetween = (start, end) => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff < 0 ? diff + 1440 : diff;
};

// 75 -> "1:15"
const formatDuration = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

// Makes text safe to put inside HTML
const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const isValidTime = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);   // 00:00 to 23:59
const selectedDate = () => $("edate").value;
const dayTotal = (date) => data[date].reduce((sum, x) => sum + minutesBetween(x.s, x.e), 0);

// ===== 3. DRAWING THE LIST =====
function renderGroupHeader(date) {
  const total = dayTotal(date);
  const reached = total >= DAILY_GOAL;
  const status = reached
    ? `<span style="color:var(--ok)">${formatDuration(total)}${total > DAILY_GOAL ? ` (+${formatDuration(total - DAILY_GOAL)})` : " ✓"}</span>`
    : `${formatDuration(total)} <span class="mut">/ 8:00 · ${formatDuration(DAILY_GOAL - total)} left</span>`;
  const width = Math.min(100, (total / DAILY_GOAL) * 100);
  return `<div class="gh">
    <div class="t"><span>${prettyDate(date)}</span><span>${status}</span></div>
    <div class="bar"><i class="${reached ? "done" : ""}" style="width:${width}%"></i></div>
  </div>`;
}

function renderEntry({ date, index, entry }) {
  return `<div class="row item">
    <div>${escapeHtml(entry.d || "(no description)")}</div>
    <div class="mut">${escapeHtml(entry.p || "")}</div>
    <div>${entry.s} – ${entry.e}</div>
    <div class="dur">${formatDuration(minutesBetween(entry.s, entry.e))}</div>
    <button class="x" data-date="${date}" data-index="${index}">✕</button>
  </div>`;
}

function render() {
  // Flatten everything into one list, newest date first, earliest start first within a day
  const all = Object.entries(data).flatMap(([date, entries]) =>
    entries.map((entry, index) => ({ date, index, entry }))
  );
  all.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.entry.s < b.entry.s ? -1 : 1
  );

  // Show a date header whenever the date changes
  let html = "";
  let lastDate = "";
  for (const item of all.slice(0, MAX_SHOWN)) {
    if (item.date !== lastDate) {
      lastDate = item.date;
      html += renderGroupHeader(item.date);
    }
    html += renderEntry(item);
  }

  $("list").innerHTML = html || '<div class="mut">No entries yet.</div>';
  $("more").textContent = all.length > MAX_SHOWN ? `Showing latest ${MAX_SHOWN} of ${all.length} entries.` : "";

  // Project suggestions come from projects you already used
  const projects = [...new Set(all.map((item) => item.entry.p).filter(Boolean))];
  $("projs").innerHTML = projects.map((p) => `<option value="${escapeHtml(p)}">`).join("");
}

// ===== 4. TIME INPUTS (24-hour typing) =====
// While typing: "1500" becomes "15:00". When leaving the box (final = true): "9" becomes "09:00".
function fixTime(input, final) {
  const digits = input.value.replace(/\D/g, "").slice(0, 4);
  let v = digits;
  if (final) {
    if (digits.length <= 2 && digits.length > 0) v = digits.padStart(2, "0") + "00";
    else if (digits.length === 3) v = "0" + digits;
  }
  if (v.length > 2) v = `${v.slice(0, 2)}:${v.slice(2)}`;
  if (final && v && !isValidTime(v)) v = "";   // throw away impossible times like 25:99
  input.value = v;
}

function updatePreviewDuration() {
  const start = $("st").value;
  const end = $("en").value;
  $("pdur").textContent = isValidTime(start) && isValidTime(end) ? formatDuration(minutesBetween(start, end)) : "0:00";
}

for (const id of ["st", "en"]) {
  const input = $(id);
  input.addEventListener("input", () => { fixTime(input, false); updatePreviewDuration(); });
  input.addEventListener("blur", () => { fixTime(input, true); updatePreviewDuration(); });
}

// ===== 5. BUTTONS =====
// Add an entry
$("add").addEventListener("click", () => {
  fixTime($("st"), true);
  fixTime($("en"), true);
  const start = $("st").value;
  const end = $("en").value;
  const date = selectedDate();

  if (!date) return alert("Pick a date");
  if (!isValidTime(start) || !isValidTime(end)) {
    return alert("Enter start and end time in 24-hour format, e.g. 15:00");
  }

  data[date] ??= [];   // create the day's list if it doesn't exist yet
  data[date].push({ d: $("desc").value.trim(), p: $("proj").value.trim(), s: start, e: end });
  data[date].sort((a, b) => (a.s < b.s ? -1 : 1));
  save();

  $("desc").value = "";
  $("st").value = end;   // next entry starts where this one ended
  $("en").value = "";
  updatePreviewDuration();
  render();
  $("desc").focus();
});

// Delete an entry (one listener for the whole list)
$("list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-index]");
  if (!button) return;
  const { date, index } = button.dataset;
  data[date].splice(Number(index), 1);
  if (data[date].length === 0) delete data[date];
  save();
  render();
});

// Calendar icon: open the date picker, and show the chosen date as a tooltip
function updateDateTooltip() {
  const date = selectedDate();
  $("calbtn").title = date ? `Date: ${prettyDate(date)}` : "Pick a date";
}
$("calbtn").addEventListener("click", () => {
  const picker = $("edate");
  try { picker.showPicker(); } catch { picker.focus(); picker.click(); }
});
$("edate").addEventListener("change", updateDateTooltip);

// ===== 6. CSV EXPORT =====
// Wrap a value in quotes if it contains commas, quotes or line breaks
const csvCell = (v) => {
  const text = String(v ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function buildCsv() {
  const rows = [["Date", "Description", "Project", "Start", "End", "Duration"]];
  for (const date of Object.keys(data).sort()) {
    const entries = [...data[date]].sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
    for (const x of entries) {
      rows.push([date, x.d, x.p, x.s, x.e, formatDuration(minutesBetween(x.s, x.e))]);
    }
  }
  // The leading \ufeff helps Excel read special characters correctly
  return "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// Plain browser download (works when you open the file yourself or host it on GitHub Pages)
function downloadFile(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("exp").addEventListener("click", async () => {
  if (Object.keys(data).length === 0) return alert("No entries to export yet.");
  const filename = `timesheet-${toIsoDate(new Date())}.csv`;
  const csv = buildCsv();

  // Inside claude.ai, downloads go through its own save feature; anywhere else, use a normal download
  let downloads = null;
  try { downloads = await window.claude?.use("downloads"); } catch {}

  if (downloads) {
    try { await downloads.save({ filename, data: csv }); } catch {}
  } else {
    downloadFile(filename, csv);
  }
});

// ===== 7. START =====
$("edate").value = toIsoDate(new Date());   // default to today
updateDateTooltip();
render();
