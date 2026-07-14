
async function get_associates() {
    const loginRes = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("Token obtained");

    const res = await fetch('http://localhost:3000/api/associates', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    console.log("Associates response:", JSON.stringify(data, null, 2));
}

get_associates().catch(console.error);
