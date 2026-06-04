/**
 * Smart IoT Roll-Call & Health Monitoring System Node Server
 * Firebase ကို လုံးဝမသုံးဘဲ Local JSON File Database စနစ်ဖြင့် အလုပ်လုပ်မည်။
 * GitHub နှင့် Render တင်ရုံဖြင့် ၁၀၀% အခမဲ့ အဆင်သင့် သုံးနိုင်သော စနစ်ဖြစ်သည်။
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware များ သတ်မှတ်ခြင်း - ပြင်ဆင်ပြီး (Static files path correctly mapped to public folder)
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database JSON File မရှိပါက ပထမဦးဆုံး အလိုအလျောက် တည်ဆောက်ပေးမည့် စနစ်
const initDatabase = () => {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            students: [
                { id: "1001", name: "မောင်ကောင်းမင်းသန့်" },
                { id: "1002", name: "မသီရိမေ" },
                { id: "1003", name: "မောင်မင်းခန့်ဇော်" },
                { id: "1004", name: "မဆုမြတ်နိုး" },
                { id: "1005", name: "မောင်သူရိန်ထွန်း" }
            ],
            attendance: {} // Format: { "subjectId_studentId": { present, time, date, temp, spo2, bpm, alert } }
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
        console.log("📝 Initialized local database.json file successfully.");
    }
};

// Database ဖတ်ခြင်း
const readDB = () => {
    initDatabase();
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error("Error reading database:", e);
        return { students: [], attendance: {} };
    }
};

// Database ထဲသို့ ပြန်လည်သိမ်းဆည်းခြင်း
const writeDB = (data) => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Error writing database:", e);
    }
};

// ==========================================
// API ENDPOINTS (ဆရာမ Web Dashboard နှင့် ESP32 အတွက်)
// ==========================================

// ၁။ ကျောင်းသားစာရင်းအားလုံးကို ဖတ်ရန် API
app.get('/api/students', (req, res) => {
    const db = readDB();
    res.json({ success: true, students: db.students });
});

// ၂။ ကျောင်းသားအသစ် ထည့်သွင်းရန် API
app.post('/api/students/add', (req, res) => {
    const { id, name } = req.body;
    if (!id || !name) {
        return res.status(400).json({ success: false, message: "ID နှင့် နာမည် အပြည့်အစုံ ဖြည့်စွက်ပေးပါ။" });
    }

    const db = readDB();
    // ID ထပ်နေခြင်း စစ်ဆေးရန်
    if (db.students.some(st => st.id === id)) {
        return res.status(400).json({ success: false, message: "ဤ ID ကို အသုံးပြုပြီးသား ဖြစ်ပါသည်။" });
    }

    db.students.push({ id, name });
    writeDB(db);
    res.json({ success: true, message: "ကျောင်းသားအသစ်ကို ဒေတာဘေ့စ်သို့ ထည့်သွင်းပြီးပါပြီ။" });
});

// ၃။ ကျောင်းသား စာရင်းထဲမှ ဖျက်သိမ်းရန် API
app.delete('/api/students/delete/:id', (req, res) => {
    const studentId = req.params.id;
    const db = readDB();
    
    const initialLength = db.students.length;
    db.students = db.students.filter(st => st.id !== studentId);

    if (db.students.length === initialLength) {
        return res.status(404).json({ success: false, message: "ဖျက်လိုသော ကျောင်းသား ID ကို ရှာမတွေ့ပါ။" });
    }

    // ဆက်စပ်နေသော အတန်းတက်ရောက်မှု ဒေတာများကိုပါ ဖျက်ခြင်း
    Object.keys(db.attendance).forEach(key => {
        if (key.endsWith(`_${studentId}`)) {
            delete db.attendance[key];
        }
    });

    writeDB(db);
    res.json({ success: true, message: "ကျောင်းသားအချက်အလက်ကို ဖျက်သိမ်းပြီးပါပြီ။" });
});

// ၄။ အတန်းတက်ရောက်မှုဒေတာအားလုံးကို ဖတ်ရန် API
app.get('/api/attendance', (req, res) => {
    const db = require('./database.json'); // dynamically load or use readDB()
    const currentDb = readDB();
    res.json({ success: true, attendance: currentDb.attendance });
});

// ၅။ ESP32 Hardware သို့မဟုတ် Web Device Simulator မှ Rollcall ပို့ရန် API
app.post('/api/rollcall', (req, res) => {
    const { studentId, subjectId, temp, spo2, bpm } = req.body;

    if (!studentId || !subjectId) {
        return res.status(400).json({ success: false, message: "ကျောင်းသား ID နှင့် ဘာသာရပ် ID လိုအပ်ပါသည်။" });
    }

    const db = readDB();
    // စာရင်းထဲတွင် ရှိမရှိ အရင်စစ်ဆေးခြင်း
    const student = db.students.find(st => st.id === String(studentId));
    if (!student) {
        return res.status(404).json({ success: false, message: "မမှန်ကန်သော ID ဖြစ်သည်။ စာရင်းမရှိပါ။" });
    }

    // လက်ရှိအချိန်နှင့် ရက်စွဲ ဖန်တီးခြင်း
    const now = new Date();
    // မြန်မာစံတော်ချိန် (GMT + 6:30) သို့ ပြောင်းလဲခြင်း
    const myanmarTime = new Date(now.getTime() + (6.5 * 60 * 60 * 1000));
    const timeStr = String(myanmarTime.getUTCHours()).padStart(2, '0') + ":" + String(myanmarTime.getUTCMinutes()).padStart(2, '0');
    
    const dateOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    const dateStr = myanmarTime.toLocaleDateString('my-MM', dateOptions);

    const isAlert = (temp > 37.5 || spo2 < 95);

    // ဒေတာ သိမ်းဆည်းရန် Key သတ်မှတ်ခြင်း (ဥပမာ- "1_1001" -> Subject 1, Student 1001)
    const recordKey = `${subjectId}_${studentId}`;
    db.attendance[recordKey] = {
        subjectId: parseInt(subjectId),
        studentId: String(studentId),
        present: true,
        time: timeStr,
        date: dateStr,
        temp: parseFloat(temp || 36.5),
        spo2: parseInt(spo2 || 98),
        bpm: parseInt(bpm || 80),
        alert: isAlert
    };

    writeDB(db);
    res.json({
        success: true,
        message: `${student.name} ၏ အတန်းတက်ရောက်မှုနှင့် ကျန်းမာရေးဒေတာ သိမ်းဆည်းပြီးပါပြီ။`,
        data: db.attendance[recordKey]
    });
});

// ၆။ ဘာသာရပ်ချိန်အသစ်အတွက် Reset ပြုလုပ်ရန် API
app.post('/api/attendance/reset', (req, res) => {
    const { subjectId } = req.body;
    if (!subjectId) {
        return res.status(400).json({ success: false, message: "ဘာသာရပ် ID လိုအပ်ပါသည်။" });
    }

    const db = readDB();
    const attendanceKeys = Object.keys(db.attendance);
    
    // ရွေးချယ်ထားသော ဘာသာရပ်နှင့် သက်ဆိုင်သည့် အတန်းတက်များကိုသာ ဖျက်ခြင်း
    attendanceKeys.forEach(key => {
        if (key.startsWith(`${subjectId}_`)) {
            delete db.attendance[key];
        }
    });

    writeDB(db);
    res.json({ success: true, message: `ဘာသာရပ် ID (${subjectId}) ၏ အချက်အလက်များကို ရှင်းလင်းပြီးပါပြီ။` });
});

// Home Route served - Always serve index.html from public directory
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server စတင်လည်ပတ်ခြင်း
initDatabase();
app.listen(PORT, () => {
    console.log(`🚀 Smart IoT Server Running at http://localhost:${PORT}`);
});
