(() => {
  "use strict";

  const dateLabel = document.getElementById("todayDateLabel");
  const dateInput = document.getElementById("dateFilter");
  const format = (value) => {
    const date = value ? new Date(`${value}T12:00:00`) : new Date();
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(date);
  };

  const syncDateLabel = () => {
    if (dateLabel) dateLabel.textContent = format(dateInput?.value);
  };

  dateInput?.addEventListener("change", syncDateLabel);
  syncDateLabel();

  const filterSheet = document.getElementById("todayFilterSheet");
  if (filterSheet) filterSheet.setAttribute("aria-hidden", "true");

  // Keep the narrow-screen filter sheet closed after browser back/forward restores.
  window.addEventListener("pageshow", () => {
    document.body.classList.remove("today-filters-open");
    document.getElementById("todayFilterToggle")?.setAttribute("aria-expanded", "false");
  });
})();
