const express = require('express');
const cors = require('cors');
const { DateTime } = require('luxon');
const ical = require('node-ical');
const axios = require('axios');
const NodeCache = require('node-cache');

const app = express();
app.use(cors());

const CALENDARS = [
  'https://calendar.google.com/calendar/ical/romanvolkonidov%40gmail.com/private-1b2dd71a5440e4cd42c7c7d4d77fd554/basic.ics',
  'https://calendar.google.com/calendar/ical/violetta6520%40gmail.com/private-4668f11232a35223fb2b7f0224414ac9/basic.ics',
  'https://calendar.google.com/calendar/ical/violetta6520%40gmail.com/public/basic.ics',
  'https://calendar.google.com/calendar/ical/p8simije0nhss305jf5qak5sm0%40group.calendar.google.com/private-8471e32b9a066146ba0545efc6d5322d/basic.ics',
  'https://calendar.google.com/calendar/ical/o6bemnc7uc56hipv6t6lntccq4%40group.calendar.google.com/private-1f621ee25080da2111e7f1c5598322a9/basic.ics'
];

const NAIROBI_TZ = 'Africa/Nairobi';
const cache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

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

app.get('/', (req, res) => {
  res.send('Calendar Events API is running');
});

app.get('/api/events', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  const cacheKey = 'events';
  const cachedEvents = cache.get(cacheKey);

  if (cachedEvents) {
    console.log('Returning cached events');
    return res.end(JSON.stringify(cachedEvents));
  }

  let allEvents = [];

  try {
    const calendarPromises = CALENDARS.map(fetchEventsFromCalendar);
    const calendarEvents = await Promise.all(calendarPromises);

    calendarEvents.forEach(events => {
      allEvents = allEvents.concat(events);
    });

    console.log('All fetched events:', allEvents);

    const todayEvents = filterEventsForToday(allEvents);
    console.log('Today\'s events:', todayEvents);

    const uniqueEvents = removeDuplicates(todayEvents);
    console.log('Unique events:', uniqueEvents);

    const groupedEvents = groupEventsBySummary(uniqueEvents);
    console.log('Grouped events:', groupedEvents);

    cache.set(cacheKey, groupedEvents);
    res.end(JSON.stringify(groupedEvents));
  } catch (error) {
    console.error('Error processing events:', error);
    res.status(500).end(JSON.stringify({ error: 'Internal server error' }));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
