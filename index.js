const express = require('express');
const cors = require('cors');
const { DateTime } = require('luxon');
const ical = require('node-ical');
const axios = require('axios');
const NodeCache = require('node-cache');

const app = express();
app.use(cors());

const CALENDARS = [
  'https://calendar.google.com/calendar/ical/violetta6520%40gmail.com/private-4668f11232a35223fb2b7f0224414ac9/basic.ics',
  'https://calendar.google.com/calendar/ical/romanvolkonidov%40gmail.com/private-1b2dd71a5440e4cd42c7c7d4d77fd554/basic.ics',
  'https://calendar.google.com/calendar/ical/p8simije0nhss305jf5qak5sm0%40group.calendar.google.com/private-8471e32b9a066146ba0545efc6d5322d/basic.ics',
  'https://calendar.google.com/calendar/ical/o6bemnc7uc56hipv6t6lntccq4%40group.calendar.google.com/private-1f621ee25080da2111e7f1c5598322a9/basic.ics'
];

const NAIROBI_TZ = 'Africa/Nairobi';
const cache = new NodeCache(); // No stdTTL, we will handle expiration manually

async function fetchEventsFromCalendar(url) {
  try {
    console.log(`Fetching events from ${url}`);
    const response = await axios.get(url, { timeout: 5000 });
    const events = ical.sync.parseICS(response.data);
    console.log(`Fetched and parsed events from ${url}`);
    return Object.values(events)
      .filter(event => event.type === 'VEVENT')
      .map(event => ({
        summary: event.summary,
        start: event.start.toISOString(),
        end: event.end.toISOString()
      }));
  } catch (error) {
    console.error(`Error fetching events from ${url}:`, error.message);
    return [];
  }
}

function filterEventsForToday(events) {
  const today = DateTime.now().setZone(NAIROBI_TZ).startOf('day');
  return events.filter(event => {
    const eventStart = DateTime.fromISO(event.start).setZone(NAIROBI_TZ);
    return eventStart.hasSame(today, 'day');
  }).map(event => ({
    ...event,
    local_start: DateTime.fromISO(event.start).setZone(NAIROBI_TZ).toFormat('yyyy-MM-dd HH:mm:ss'),
    local_end: DateTime.fromISO(event.end).setZone(NAIROBI_TZ).toFormat('yyyy-MM-dd HH:mm:ss')
  }));
}

function removeDuplicates(events) {
  const seen = new Set();
  return events.filter(event => {
    const key = `${event.summary}-${event.start}-${event.end}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function groupEventsBySummary(events) {
  return events.reduce((acc, event) => {
    if (!acc[event.summary]) {
      acc[event.summary] = [];
    }
    acc[event.summary].push(event);
    return acc;
  }, {});
}

async function updateEventsCache() {
  let allEvents = [];

  try {
    const calendarPromises = CALENDARS.map(fetchEventsFromCalendar);
    const calendarEvents = await Promise.all(calendarPromises);

    calendarEvents.forEach(events => {
      allEvents = allEvents.concat(events);
    });

    const todayEvents = filterEventsForToday(allEvents);
    const uniqueEvents = removeDuplicates(todayEvents);
    const groupedEvents = groupEventsBySummary(uniqueEvents);

    const now = DateTime.now().setZone(NAIROBI_TZ);
    const nextDay = now.plus({ days: 1 }).startOf('day');
    const ttl = nextDay.diff(now, 'seconds').seconds;

    cache.set('events', groupedEvents, ttl);
    console.log('Events cache updated');
  } catch (error) {
    console.error('Error updating events cache:', error);
  }
}

// Schedule the updateEventsCache function to run every 96 seconds
setInterval(updateEventsCache, 96000);

// Initial cache update
updateEventsCache();

app.get('/', (req, res) => {
  res.send('Calendar Events API is running');
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  const cachedEvents = cache.get('events');

  if (cachedEvents) {
    console.log('Returning cached events');
    return res.end(JSON.stringify(cachedEvents));
  } else {
    console.log('Cache is empty, returning empty response');
    res.end(JSON.stringify({}));
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
