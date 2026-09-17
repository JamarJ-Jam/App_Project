import * as Calendar from 'expo-calendar/legacy';

export type CalendarOperationError =
  | 'permission_denied'
  | 'event_not_found'
  | 'calendar_not_found'
  | 'calendar_read_only'
  | 'unsupported_recurring_event'
  | 'unsupported_all_day_event'
  | 'invalid_time_range'
  | 'provider_error';

export type CalendarOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: CalendarOperationError; message: string };

type CalendarProviderEvent = {
  id: string;
  calendarId: string;
  title?: string;
  startDate: Date | string;
  endDate: Date | string;
  timeZone?: string;
  allDay?: boolean;
  recurrenceRule?: unknown;
};

type CalendarProviderCalendar = {
  id: string;
  allowsModifications?: boolean;
  accessLevel?: unknown;
};

export interface CalendarEventContext {
  event: CalendarProviderEvent;
  calendar: CalendarProviderCalendar;
  externalEventId: string;
  calendarId: string;
  startDate: Date;
  endDate: Date;
  durationMs: number;
  timeZone?: string;
  allDay: boolean;
  recurring: boolean;
  editable: boolean;
}

const failure = <T>(
  error: CalendarOperationError,
  message: string
): CalendarOperationResult<T> => ({
  ok: false,
  error,
  message,
});

const asDate = (value: Date | string): Date =>
  value instanceof Date ? new Date(value.getTime()) : new Date(value);

const hasPermission = async (): Promise<boolean> => {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.status === 'granted') return true;

  const requested = await Calendar.requestCalendarPermissionsAsync();
  return requested.status === 'granted';
};

const resolveContext = async (
  event: CalendarProviderEvent,
  suppliedCalendarId?: string
): Promise<CalendarOperationResult<CalendarEventContext>> => {
  const calendars = (await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT
  )) as CalendarProviderCalendar[];
  const calendarId = event.calendarId;

  if (suppliedCalendarId && suppliedCalendarId !== calendarId) {
    return failure(
      'calendar_not_found',
      'The event calendar no longer matches the selected calendar.'
    );
  }

  const calendar = calendars.find((item) => item.id === calendarId);
  if (!calendar) {
    return failure(
      'calendar_not_found',
      'The calendar containing this event could not be found.'
    );
  }

  const startDate = asDate(event.startDate);
  const endDate = asDate(event.endDate);
  if (
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime()) ||
    endDate <= startDate
  ) {
    return failure(
      'invalid_time_range',
      'The calendar event has an invalid time range.'
    );
  }

  const recurring = event.recurrenceRule != null;
  const allDay = event.allDay === true;
  const editable = calendar.allowsModifications === true;

  return {
    ok: true,
    value: {
      event,
      calendar,
      externalEventId: event.id,
      calendarId,
      startDate,
      endDate,
      durationMs: endDate.getTime() - startDate.getTime(),
      timeZone: event.timeZone,
      allDay,
      recurring,
      editable,
    },
  };
};

export const getCalendarEventContext = async (
  externalEventId: string,
  calendarId?: string
): Promise<CalendarOperationResult<CalendarEventContext>> => {
  if (!externalEventId) {
    return failure('event_not_found', 'No calendar event was specified.');
  }

  try {
    if (!(await hasPermission())) {
      return failure(
        'permission_denied',
        'Calendar permission is required to access this event.'
      );
    }

    let event: CalendarProviderEvent;
    try {
      event = (await Calendar.getEventAsync(
        externalEventId
      )) as CalendarProviderEvent;
    } catch {
      return failure(
        'event_not_found',
        'This calendar event no longer exists.'
      );
    }

    return resolveContext(event, calendarId);
  } catch {
    return failure(
      'provider_error',
      'The calendar event could not be loaded.'
    );
  }
};

export const canRescheduleCalendarEvent = async (
  context: CalendarEventContext
): Promise<CalendarOperationResult<{ editable: true }>> => {
  if (context.recurring) {
    return failure(
      'unsupported_recurring_event',
      'Recurring calendar events cannot be rescheduled yet.'
    );
  }

  if (context.allDay) {
    return failure(
      'unsupported_all_day_event',
      'All-day calendar events cannot be rescheduled yet.'
    );
  }

  if (!context.editable) {
    return failure(
      'calendar_read_only',
      'This calendar is read-only.'
    );
  }

  return { ok: true, value: { editable: true } };
};

export const rescheduleCalendarEvent = async (
  externalEventId: string,
  nextStart: Date,
  nextEnd?: Date,
  calendarId?: string
): Promise<CalendarOperationResult<CalendarEventContext>> => {
  const contextResult = await getCalendarEventContext(
    externalEventId,
    calendarId
  );
  if (!contextResult.ok) return contextResult;

  const editableResult = await canRescheduleCalendarEvent(
    contextResult.value
  );
  if (!editableResult.ok) return editableResult;

  const end = nextEnd ||
    new Date(nextStart.getTime() + contextResult.value.durationMs);

  if (
    !Number.isFinite(nextStart.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= nextStart
  ) {
    return failure(
      'invalid_time_range',
      'Choose an end time after the start time.'
    );
  }

  try {
    await Calendar.updateEventAsync(externalEventId, {
      startDate: nextStart,
      endDate: end,
    });

    const refreshed = await Calendar.getEventAsync(
      externalEventId
    );
    return resolveContext(
      refreshed as CalendarProviderEvent,
      contextResult.value.calendarId
    );
  } catch {
    return failure(
      'provider_error',
      'The calendar event could not be rescheduled.'
    );
  }
};
