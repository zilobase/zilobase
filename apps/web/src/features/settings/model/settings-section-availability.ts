export function isSettingsSectionAvailable(section: string, availability: { calendar: boolean }) {
  if (section === "calendar") return availability.calendar;
  return true;
}
