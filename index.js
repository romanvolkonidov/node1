const express = require('express');
const cors = require('cors');
const { DateTime } = require('luxon');
const ical = require('node-ical');
const axios = require('axios');

const app = express();
app.use(cors());

const CALENDARS = [
  'https://calendar.google.com/calendar/ical/romanvolkonidov%40gmail.com/private-1b2dd71a5440e4cd42c7c7d4d77fd554/basic.ics'
];

const NAIROBI_TZ = 'Africa/Nairobi';

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

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  let allEvents = [];

  const processCalendar = async (url, index) => {
    try {
      const events = await fetchEventsFromCalendar(url);
      allEvents = allEvents.concat(events);
      const todayEvents = filterEventsForToday(allEvents);
      const groupedEvents = groupEventsBySummary(todayEvents);
      res.write(JSON.stringify({ progress: (index + 1) / CALENDARS.length, events: groupedEvents }));
    } catch (error) {
      console.error(`Error processing calendar ${url}:`, error);
    }
  };

  Promise.all(CALENDARS.map(processCalendar))
    .then(() => {
      res.end();
    })
    .catch((error) => {
      console.error('Error processing events:', error);
      res.status(500).end(JSON.stringify({ error: 'Internal server error' }));
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
