/**
 * School Timezone Utility
 * Computes dates and times according to the school's configured timezone (default: Africa/Lagos).
 */

export interface SchoolTimeInfo {
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm (24-hour)
  displayTimeStr: string; // e.g. "08:35 AM"
  fullDateTimeStr: string; // YYYY-MM-DD HH:mm:ss
}

export function getSchoolTime(timeZone: string = 'Africa/Lagos', dateInput?: Date | string | null): SchoolTimeInfo {
  const targetDate = dateInput ? new Date(dateInput) : new Date();

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(targetDate);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    const dateStr = `${year}-${month}-${day}`;
    const timeStr = `${hour}:${minute}`;
    
    let hNum = parseInt(hour, 10);
    const ampm = hNum >= 12 ? 'PM' : 'AM';
    hNum = hNum % 12 || 12;
    const displayTimeStr = `${String(hNum).padStart(2, '0')}:${minute} ${ampm}`;

    return {
      dateStr,
      timeStr,
      displayTimeStr,
      fullDateTimeStr: `${dateStr} ${hour}:${minute}:${second}`,
    };
  } catch (err) {
    // Fallback if timezone string is invalid
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const hour = String(targetDate.getHours()).padStart(2, '0');
    const minute = String(targetDate.getMinutes()).padStart(2, '0');
    const second = String(targetDate.getSeconds()).padStart(2, '0');

    const dateStr = `${year}-${month}-${day}`;
    const timeStr = `${hour}:${minute}`;
    let hNum = parseInt(hour, 10);
    const ampm = hNum >= 12 ? 'PM' : 'AM';
    hNum = hNum % 12 || 12;

    return {
      dateStr,
      timeStr,
      displayTimeStr: `${String(hNum).padStart(2, '0')}:${minute} ${ampm}`,
      fullDateTimeStr: `${dateStr} ${hour}:${minute}:${second}`,
    };
  }
}
