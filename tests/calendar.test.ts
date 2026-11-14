import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, formatShort, formatWithWeekday, isValidYmd, todayYmd } from '../src/model/dates';
import { deadlineState } from '../src/model/deadline';
import {
  czechHolidays,
  easterSunday,
  isWorkingDay,
  nonWorkingReason,
  toLastWorkingDayOnOrBefore,
  workingDaysBetween,
} from '../src/model/holidays';

describe('data bez časové zóny', () => {
  it('validace a aritmetika přes přestupný rok, konec měsíce a změnu času', () => {
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2028-02-29')).toBe(true);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('26-1-1')).toBe(false);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // přes změnu na letní čas
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // přes změnu na zimní čas
  });

  it('dnešek se bere v místním čase (žádný posun přes UTC)', () => {
    expect(todayYmd(new Date(2026, 10, 14, 0, 5))).toBe('2026-11-14');
    expect(todayYmd(new Date(2026, 10, 14, 23, 55))).toBe('2026-11-14');
  });

  it('český formát s rokem jen když není letošní', () => {
    expect(formatShort('2026-11-15', '2026-11-14')).toBe('15. 11.');
    expect(formatShort('2027-01-04', '2026-11-14')).toBe('4. 1. 2027');
    expect(formatWithWeekday('2026-09-25', '2026-01-01')).toBe('pá 25. 9.');
  });
});

describe('svátky ČR', () => {
  it('Velikonoční neděle pro několik let', () => {
    expect(easterSunday(2008)).toBe('2008-03-23');
    expect(easterSunday(2019)).toBe('2019-04-21');
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2038)).toBe('2038-04-25');
  });

  it('13 svátků včetně Velkého pátku a Velikonočního pondělí', () => {
    const h = czechHolidays(2026);
    expect(h.size).toBe(13);
    expect(h.get('2026-04-03')).toBe('Velký pátek');
    expect(h.get('2026-04-06')).toBe('Velikonoční pondělí');
    for (const d of ['01-01', '05-01', '05-08', '07-05', '07-06', '09-28', '10-28', '11-17', '12-24', '12-25', '12-26']) {
      expect(h.has(`2026-${d}`)).toBe(true);
    }
  });

  it('pracovní dny', () => {
    expect(isWorkingDay('2026-11-13')).toBe(true); // pátek
    expect(isWorkingDay('2026-11-14')).toBe(false); // sobota
    expect(isWorkingDay('2026-11-17')).toBe(false); // svátek v úterý
    expect(nonWorkingReason('2026-11-15')).toBe('neděli');
    expect(nonWorkingReason('2026-09-28')).toBe('svátek');
  });
});

describe('poslední pracovní den v daný den nebo před ním', () => {
  it('pracovní den zůstává', () => {
    expect(toLastWorkingDayOnOrBefore('2026-11-13')).toBe('2026-11-13');
  });
  it('sobota a neděle → pátek', () => {
    expect(toLastWorkingDayOnOrBefore('2026-11-14')).toBe('2026-11-13');
    expect(toLastWorkingDayOnOrBefore('2026-11-15')).toBe('2026-11-13');
  });
  it('svátek v pondělí → pátek před ním', () => {
    expect(dayOfWeek('2026-09-28')).toBe(1);
    expect(toLastWorkingDayOnOrBefore('2026-09-28')).toBe('2026-09-25');
  });
  it('Velikonoce: pondělí → čtvrtek (přes Velký pátek a víkend)', () => {
    expect(toLastWorkingDayOnOrBefore('2026-04-06')).toBe('2026-04-02');
  });
  it('1. 1. → poslední pracovní den roku předchozího', () => {
    expect(toLastWorkingDayOnOrBefore('2027-01-01')).toBe('2026-12-31');
  });
  it('víkend navazující na svátky (Vánoce 2026, 5.–6. 7. 2026)', () => {
    expect(toLastWorkingDayOnOrBefore('2026-12-27')).toBe('2026-12-23');
    expect(toLastWorkingDayOnOrBefore('2026-07-06')).toBe('2026-07-03');
  });
});

describe('pracovní dny v intervalu (dnes, termín]', () => {
  it('pátek → středa = 3', () => {
    expect(workingDaysBetween('2026-11-06', '2026-11-11')).toBe(3);
  });
  it('přes svátek se svátek nepočítá', () => {
    expect(workingDaysBetween('2026-11-13', '2026-11-18')).toBe(2);
  });
  it('přes přelom roku', () => {
    expect(workingDaysBetween('2026-12-23', '2027-01-04')).toBe(5);
  });
  it('stejný den nebo minulost = 0', () => {
    expect(workingDaysBetween('2026-11-13', '2026-11-13')).toBe(0);
    expect(workingDaysBetween('2026-11-13', '2026-11-10')).toBe(0);
  });
});

describe('zvýraznění termínu', () => {
  const today = '2026-11-13'; // pátek
  it('dnešek, včerejšek', () => {
    expect(deadlineState('2026-11-13', today, 'new')).toBe('today');
    expect(deadlineState('2026-11-12', today, 'in_progress')).toBe('overdue');
  });
  it('1–3 pracovní dny oranžově, přes víkend a svátek', () => {
    expect(deadlineState('2026-11-16', today, 'new')).toBe('soon'); // po = 1
    expect(deadlineState('2026-11-18', today, 'new')).toBe('soon'); // po, st = 2 (út svátek)
    expect(deadlineState('2026-11-19', today, 'new')).toBe('soon'); // 3
    expect(deadlineState('2026-11-20', today, 'new')).toBe('none'); // 4
  });
  it('termín na víkendu se nejdřív posune na pátek', () => {
    const due = toLastWorkingDayOnOrBefore('2026-11-15');
    expect(due).toBe('2026-11-13');
    expect(deadlineState(due, today, 'new')).toBe('today');
    expect(deadlineState(due, '2026-11-12', 'new')).toBe('soon');
  });
  it('přes přelom roku', () => {
    expect(deadlineState('2027-01-04', '2026-12-30', 'new')).toBe('soon'); // 31. 12., 4. 1. = 2
  });
  it('Hotovo, Zrušeno a bez termínu bez zvýraznění', () => {
    expect(deadlineState('2026-11-12', today, 'done')).toBe('none');
    expect(deadlineState('2026-11-12', today, 'cancelled')).toBe('none');
    expect(deadlineState(undefined, today, 'new')).toBe('none');
  });
});
