const express = require("express")
const app = express()
const path = require('path')
const mongoose = require("mongoose")
app.use(express.json())
app.use(express.urlencoded({ extended: true }))


mongoose.connect("mongodb://127.0.0.1:27017/APPDB")
.then(() => console.log("Mongo Connected"))
.catch(err => console.log(err))

const configSchema = new mongoose.Schema({

    appliance1: String,
    app1start: Number,
    app1end: Number,
    app1duration: Number,

    appliance2: String,
    app2start: Number,
    app2end: Number,
    app2duration: Number,

    appliance3: String,
    app3start: Number,
    app3end: Number,
    app3duration: Number,

    appliance4: String,
    app4start: Number,
    app4end: Number,
    app4duration: Number,

    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Config = mongoose.model("Config", configSchema)

const tariffSchema = new mongoose.Schema({
    time0: Number,
    time1: Number,
    time2: Number,
    time3: Number,
    time4: Number,
    time5: Number,
    time6: Number,
    time7: Number,
    time8: Number,
    time9: Number,
    time10: Number,
    time11: Number,
    time12: Number,
    time13: Number,
    time14: Number,
    time15: Number,
    time16: Number,
    time17: Number,
    time18: Number,
    time19: Number,
    time20: Number,
    time21: Number,
    time22: Number,
    time23: Number,

    createdAt: {
        type: Date,
        default: Date.now
    }
})

const scheduleSchema = new mongoose.Schema({
    generated_at: String,
    schedule: [
        {
            channel: Number,
            appliance: String,
            start_hour: Number,
            end_hour: Number,
            start_time: String,
            end_time: String,
            run_hours: Number,
            cost_estimate: Number,
            date: String,
            status: String
        }
    ],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Schedule = mongoose.model("Schedule", scheduleSchema)

const costLogSchema = new mongoose.Schema({
    date:  String,           // "2025-04-01"
    hour:  Number,           // 0-23
    channels: [
        {
            channel:   Number,
            appliance: String,
            energy_Wh: Number,
            cost_Rs:   Number,
        }
    ],
    total_cost_Rs: Number,
    createdAt: { type: Date, default: Date.now }
});

const CostLog = mongoose.model("CostLog", costLogSchema);


// ── LIVE CURRENT SCHEMA ─────────────────────────────────────────
// Stores the latest real-time current reading from the Pi.
// Only one document is ever kept (upsert by a fixed key).

const liveCurrentSchema = new mongoose.Schema({
    _key:      { type: String, default: "live", unique: true },
    timestamp: String,
    channels: [
        {
            channel:   Number,
            current_A: Number,
            power_W:   Number,
        }
    ],
    updatedAt: { type: Date, default: Date.now }
});

const LiveCurrent = mongoose.model("LiveCurrent", liveCurrentSchema);


// ── API: POST /api/cost  (called by serial_reader.py on the Pi) ─
// (paste near your existing /api/schedule POST route)

app.post("/api/cost", async (req, res) => {
    try {
        const log = new CostLog(req.body);
        await log.save();
        res.json({ message: "Cost log saved" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error saving cost log" });
    }
});


// ── API: GET /api/cost  (dashboard: last 7 days, hourly breakdown) ─

app.get("/api/cost", async (req, res) => {
    try {
        // Default: last 7 days
        const days   = parseInt(req.query.days  || "7");
        const since  = new Date();
        since.setDate(since.getDate() - days);
        const sinceStr = since.toISOString().slice(0, 10);

        const logs = await CostLog.find({ date: { $gte: sinceStr } })
                                  .sort({ date: 1, hour: 1 });
        res.json(logs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error fetching cost logs" });
    }
});


// ── API: POST /api/live-current  (called by serial_reader.py every 5s) ─

app.post("/api/live-current", async (req, res) => {
    try {
        // Upsert: always keep only one "live" document
        await LiveCurrent.findOneAndUpdate(
            { _key: "live" },
            {
                timestamp:  req.body.timestamp,
                channels:   req.body.channels,
                updatedAt:  new Date(),
            },
            { upsert: true, new: true }
        );
        res.json({ message: "Live current updated" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error saving live current" });
    }
});


// ── API: GET /api/live-current  (dashboard polls this for live load) ─

app.get("/api/live-current", async (req, res) => {
    try {
        const doc = await LiveCurrent.findOne({ _key: "live" });
        res.json(doc || { channels: [] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error fetching live current" });
    }
});


// ── API: GET /api/cost/daily-summary  (dashboard bar chart) ─────
// Returns one total cost per day for the last N days

app.get("/api/cost/daily-summary", async (req, res) => {
    try {
        const days  = parseInt(req.query.days || "7");
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceStr = since.toISOString().slice(0, 10);

        const logs = await CostLog.find({ date: { $gte: sinceStr } });

        // Group by date
        const byDate = {};
        for (const log of logs) {
            if (!byDate[log.date]) byDate[log.date] = 0;
            byDate[log.date] += log.total_cost_Rs || 0;
        }

        const result = Object.entries(byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, total]) => ({ date, total_cost_Rs: parseFloat(total.toFixed(4)) }));

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error computing daily summary" });
    }
});


const Tariff = mongoose.model("Tariff", tariffSchema)

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '/views'))
app.use(express.static("public"));

app.listen('3000', () => {
    console.log('Listening')
})

app.get("/config", (req, res) => {
    res.render('config.ejs')
})

app.get("/dashboard", async (req, res) => {
    try {
        const sevendaylabel = getLast7Days();   // your existing helper

        // Latest schedule (today's) — most recently saved document
        const latestSchedule = await Schedule.findOne().sort({ createdAt: -1 });
        const schedule = latestSchedule ? latestSchedule.schedule : [];

        // Counts for stat cards
        const activeChannels  = schedule.filter(s => s.status === 'scheduled').length;
        const scheduledCount  = schedule.filter(s => s.status === 'scheduled').length;

        // Peak tariff from the latest tariff document
        const latestTariff = await Tariff.findOne().sort({ createdAt: -1 });
        let peakTariff = null;
        if (latestTariff) {
            const rates = Array.from({length: 24}, (_, h) => latestTariff[`time${h}`] || 0);
            peakTariff = Math.max(...rates);
        }

        // Today's total cost (sum of all cost logs for today)
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayLogs = await CostLog.find({ date: todayStr });
        const todayCost = todayLogs.reduce((sum, log) => sum + (log.total_cost_Rs || 0), 0);

        // Last 7 days cost data for the chart
        const since = new Date();
        since.setDate(since.getDate() - 7);
        const sinceStr = since.toISOString().slice(0, 10);
        const dailyData = await CostLog.find({ date: { $gte: sinceStr } }).sort({ date: 1, hour: 1 });

        // Recent schedule history — last 5 generated schedules
        const recentSchedules = await Schedule.find()
            .sort({ createdAt: -1 })
            .limit(5);

        res.render('dashboard.ejs', {
            sevendays:       sevendaylabel,
            schedule:        schedule,
            activeChannels:  activeChannels,
            scheduledCount:  scheduledCount,
            peakTariff:      peakTariff,
            todayCost:       parseFloat(todayCost.toFixed(2)),
            dailyData:       dailyData,
            recentSchedules: recentSchedules,
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading dashboard");
    }
});


// ── 2. ADD this new endpoint (used by dashboard's live polling) ──
//       GET /api/cost/today

app.get("/api/cost/today", async (req, res) => {
    try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const logs = await CostLog.find({ date: todayStr });

        const total = logs.reduce((sum, l) => sum + (l.total_cost_Rs || 0), 0);

        // Count distinct channels that have logged cost today
        const activeSet = new Set();
        logs.forEach(l => (l.channels || []).forEach(ch => {
            if (ch.cost_Rs > 0) activeSet.add(ch.channel);
        }));

        res.json({
            date:            todayStr,
            total_cost_Rs:   parseFloat(total.toFixed(4)),
            active_channels: activeSet.size,
            hour_count:      logs.length,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error fetching today cost" });
    }
});

app.get("/tariffupdate", (req, res) => {
    res.render('tariffupdate.ejs')
})

app.get("/", (req, res) => {
    res.render('home.ejs')
})

// GET latest config
app.get("/api/config", async (req, res) => {
    try {
        const data = await Config.findOne().sort({ createdAt: -1 })
        res.json(data)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Error fetching config" })
    }
})

app.get("/api/tariff", async (req, res) => {
    try {
        const data = await Tariff.findOne().sort({ createdAt: -1 })
        res.json(data)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Error fetching tariff" })
    }
})

// POST schedule from Raspberry Pi
app.post("/api/schedule", async (req, res) => {
    try {
        const newSchedule = new Schedule(req.body)
        await newSchedule.save()
        res.json({ message: "Schedule saved" })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Error saving schedule" })
    }
})
app.post("/config", async (req, res) => {
    try {

        const newConfig = new Config({

            appliance1: req.body.appliance1,
            app1start: Number(req.body.app1start),
            app1end: Number(req.body.app1end),
            app1duration: Number(req.body.app1duration),

            appliance2: req.body.appliance2,
            app2start: Number(req.body.app2start),
            app2end: Number(req.body.app2end),
            app2duration: Number(req.body.app2duration),

            appliance3: req.body.appliance3,
            app3start: Number(req.body.app3start),
            app3end: Number(req.body.app3end),
            app3duration: Number(req.body.app3duration),

            appliance4: req.body.appliance4,
            app4start: Number(req.body.app4start),
            app4end: Number(req.body.app4end),
            app4duration: Number(req.body.app4duration)

        });

        await newConfig.save()

        res.redirect("/dashboard")

    } catch (err) {
        console.error(err)
        res.status(500).send("Error saving config")
    }
})

app.post("/tariffupdate", async (req, res) => {
    try {

        const newTariff = new Tariff({
            time0: Number(req.body.time0),
            time1: Number(req.body.time1),
            time2: Number(req.body.time2),
            time3: Number(req.body.time3),
            time4: Number(req.body.time4),
            time5: Number(req.body.time5),
            time6: Number(req.body.time6),
            time7: Number(req.body.time7),
            time8: Number(req.body.time8),
            time9: Number(req.body.time9),
            time10: Number(req.body.time10),
            time11: Number(req.body.time11),
            time12: Number(req.body.time12),
            time13: Number(req.body.time13),
            time14: Number(req.body.time14),
            time15: Number(req.body.time15),
            time16: Number(req.body.time16),
            time17: Number(req.body.time17),
            time18: Number(req.body.time18),
            time19: Number(req.body.time19),
            time20: Number(req.body.time20),
            time21: Number(req.body.time21),
            time22: Number(req.body.time22),
            time23: Number(req.body.time23)
        })

        await newTariff.save()

        res.redirect("/dashboard")

    } catch (err) {
        console.error(err)
        res.status(500).send("Error saving tariff")
    }
})

function getLast7Days() {
    const labels = [];
    const today = new Date();

    for (let i = 7; i >= 1; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);

        labels.push(
            d.toLocaleDateString('en-US', { weekday: 'short' })
        );
    }

    return labels;
}