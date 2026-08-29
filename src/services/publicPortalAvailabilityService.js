function getMinutesSinceMidnight(value) {
  const match = String(value || "").match(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
  if (!match) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatBusinessTime(value) {
  const minutesSinceMidnight = getMinutesSinceMidnight(value);
  if (minutesSinceMidnight === null) return "";
  const hours24 = Math.floor(minutesSinceMidnight / 60);
  const minutes = String(minutesSinceMidnight % 60).padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

function getPublicPortalAvailability(settings, now = new Date()) {
  const openingTime = String(settings?.businessOpeningTime || "");
  const closingTime = String(settings?.businessClosingTime || "");
  const openingMinutes = getMinutesSinceMidnight(openingTime);
  const closingMinutes = getMinutesSinceMidnight(closingTime);

  // Hours are opt-in: existing facilities keep their current always-on portal
  // until a Super Admin chooses both times in Business Settings.
  if (openingMinutes === null || closingMinutes === null || openingMinutes === closingMinutes) {
    return {
      isOpen: true,
      restrictToBusinessHours: false,
      openingTime: "",
      closingTime: "",
      message: "",
    };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isOvernight = openingMinutes > closingMinutes;
  const isOpen = isOvernight
    ? nowMinutes >= openingMinutes || nowMinutes < closingMinutes
    : nowMinutes >= openingMinutes && nowMinutes < closingMinutes;
  const formattedOpeningTime = formatBusinessTime(openingTime);
  const formattedClosingTime = formatBusinessTime(closingTime);

  return {
    isOpen,
    restrictToBusinessHours: true,
    openingTime,
    closingTime,
    message: isOpen
      ? ""
      : `The report portal is available from ${formattedOpeningTime} to ${formattedClosingTime}. Please try again during business hours.`,
  };
}

module.exports = { formatBusinessTime, getPublicPortalAvailability };
