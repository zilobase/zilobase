export function isSettingsSectionAvailable(
  section: string,
  availability: { mail: boolean; calendar: boolean },
) {
  if (section === "mail") return availability.mail;
  if (section === "calendar") return availability.calendar;
  return true;
}
