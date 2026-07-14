const http = require('http');

const payload = JSON.stringify({
  name: "Test Patient",
  age: 30,
  gender: "Male",
  phone: "1234567890",
  tests: [{ id: 833, isOutside: false, isCustom: false }] // RBC Count
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/patients/1',
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': payload.length,
    // Add auth token from localStorage if needed... wait, I can just mock auth by skipping middleware or doing it in DB directly.
  }
};
