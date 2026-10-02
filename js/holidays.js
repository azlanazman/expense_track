// Malaysian FEDERAL public holidays used by Analysis (Holiday row, daily views, readouts).
// State-only holidays are not listed, and neither are replacement days or New Year's Day, Thaipusam, Nuzul Quran and Good Friday
// (not federal for every state). Dates were checked against published gazette lists on 2026-10-02.
// 2027 lunar dates are provisional and can move by a day; review this file each year.
// Coverage: 2025 has only the days that fall inside the Analysis window when this was written (Oct–Dec 2025).
const HOLIDAYS = {
  '2025-10-20': 'Deepavali',
  '2025-12-25': 'Christmas',

  '2026-02-17': 'Chinese New Year',
  '2026-02-18': 'Chinese New Year',
  '2026-03-20': 'Hari Raya (additional holiday)',
  '2026-03-21': 'Hari Raya Aidilfitri',
  '2026-03-22': 'Hari Raya Aidilfitri',
  '2026-05-01': 'Labour Day',
  '2026-05-27': 'Hari Raya Haji',
  '2026-05-31': 'Wesak Day',
  '2026-06-01': 'Agong birthday',
  '2026-06-17': 'Awal Muharram',
  '2026-08-25': 'Maulidur Rasul',
  '2026-08-31': 'National Day',
  '2026-09-16': 'Malaysia Day',
  '2026-11-08': 'Deepavali',
  '2026-12-25': 'Christmas',

  '2027-02-06': 'Chinese New Year',
  '2027-02-07': 'Chinese New Year',
  '2027-03-10': 'Hari Raya Aidilfitri',
  '2027-03-11': 'Hari Raya Aidilfitri',
  '2027-05-01': 'Labour Day',
  '2027-05-17': 'Hari Raya Haji',
  '2027-05-20': 'Wesak Day',
  '2027-06-06': 'Awal Muharram',
  '2027-06-07': 'Agong birthday',
  '2027-08-15': 'Maulidur Rasul',
  '2027-08-31': 'National Day',
  '2027-09-16': 'Malaysia Day',
  '2027-10-28': 'Deepavali',
  '2027-12-25': 'Christmas',
};

// Name of the holiday on "YYYY-MM-DD", or null
export function holidayOn(date) { return HOLIDAYS[date] || null; }

// [{ date, name }] for start..end inclusive ("YYYY-MM-DD" strings compare in date order)
export function holidaysBetween(start, end) {
  return Object.keys(HOLIDAYS).filter(d => d >= start && d <= end).sort().map(d => ({ date: d, name: HOLIDAYS[d] }));
}
