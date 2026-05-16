const express = require("express")
const app = express()
const path = require('path')
const mongoose = require("mongoose")
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

mongoose.connect("mongodb://127.0.0.1:27017/APPDB")
.then(() => console.log("Mongo Connected"))
.catch(err => console.log(err))

// ── SCHEMAS ──────────────────────────────────────────────────────

const configSchema = new mongoose.Schema({
    appliance1:   String,
    app1start:    Number,   // minutes from midnight  e.g. 180 = 03:00
    app1end:      Number,   // minutes from midnight  e.g. 720 = 12:00
    app1duration: Number,   // run duration in MINUTES e.g. 90
    app1wattage:  Number,   // watts e.g. 2000

    appliance2:   String,
    app2start:    Number,
    app2end:      Number,
    app2duration: Number,
    app2wattage:  Number,

    appliance3:   String,
    app3start:    Number,
    app3end:      Number,
    app3duration: Number,
    app3wattage:  Number,

    appliance4:   String,
    app4start:    Number,
    app4end:      Number,
    app4duration: Number,
    app4wattage:  Number,

    createdAt: { type: Date, default: Date.now }
})
const Config = mongoose.model("Config", configSchema)

const tariffSchema = new mongoose.Schema({
    time0: Number, time1: Number, time2: Number, time3: Number,
    time4: Number, time5: Number, time6: Number, time7: Number,
    time8: Number, time9: Number, time10: Number, time11: Number,
    time12: Number, time13: Number, time14: Number, time15: Number,
    time16: Number, time17: Number, time18: Number, time19: Number,
    time20: Number, time21: Number, time22: Number, time23: Number,
    createdAt: { type: Date, default: Date.now }
})
const Tariff = mongoose.model("Tariff", tariffSchema)

// ── start_minute / end_minute added for minute-resolution scheduling ──
const scheduleSchema = new mongoose.Schema({
    generated_at: String,
    schedule: [
        {
            channel:      Number,
            appliance:    String,
            start_minute: Number,   // minutes from midnight (new)
            end_minute:   Number,   // minutes from midnight (new)
            start_hour:   Number,   // kept for backward compat
            end_hour:     Number,
            start_time:   String,   // "HH:MM"
            end_time:     String,
            run_hours:    Number,   // actually minutes — field name kept for DB compat
            cost_estimate: Number,
            date:         String,
            status:       String
        }
    ],
    createdAt: { type: Date, default: Date.now }
})
const Schedule = mongoose.model("Schedule", scheduleSchema)

const costLogSchema = new mongoose.Schema({
    date:  String,
    hour:  Number,
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
})
const CostLog = mongoose.model("CostLog", costLogSchema)

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
})
const LiveCurrent = mongoose.model("LiveCurrent", liveCurrentSchema)

// ── EXPRESS SETUP ────────────────────────────────────────────────

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '/views'))
app.use(express.static("public"))

app.listen('3000', () => console.log('Listening on :3000'))

// ── PAGE ROUTES ──────────────────────────────────────────────────

app.get("/", (req, res) => res.render('home.ejs'))

app.get("/config", (req, res) => res.render('config.ejs'))

app.get("/tariffupdate", (req, res) => res.render('tariffupdate.ejs'))

app.get("/dashboard", async (req, res) => {
    try {
        const sevendaylabel = getLast7Days()

        const latestSchedule = await Schedule.findOne().sort({ createdAt: -1 })
        const schedule = latestSchedule ? latestSchedule.schedule : []

        const activeChannels = schedule.filter(s => s.status === 'scheduled').length
        const scheduledCount = schedule.filter(s => s.status === 'scheduled').length

        const latestTariff = await Tariff.findOne().sort({ createdAt: -1 })
        let peakTariff = null
        if (latestTariff) {
            const rates = Array.from({ length: 24 }, (_, h) => latestTariff[`time${h}`] || 0)
            peakTariff = Math.max(...rates)
        }

        const todayStr   = new Date().toISOString().slice(0, 10)
        const todayLogs  = await CostLog.find({ date: todayStr })
        const todayCost  = todayLogs.reduce((sum, log) => sum + (log.total_cost_Rs || 0), 0)

        const since = new Date()
        since.setDate(since.getDate() - 7)
        const sinceStr  = since.toISOString().slice(0, 10)
        const dailyData = await CostLog.find({ date: { $gte: sinceStr } }).sort({ date: 1, hour: 1 })

        const recentSchedules = await Schedule.find().sort({ createdAt: -1 }).limit(5)

        res.render('dashboard.ejs', {
            sevendays:       sevendaylabel,
            schedule:        schedule,
            activeChannels:  activeChannels,
            scheduledCount:  scheduledCount,
            peakTariff:      peakTariff,
            todayCost:       parseFloat(todayCost.toFixed(2)),
            dailyData:       dailyData,
            recentSchedules: recentSchedules,
        })
    } catch (err) {
        console.error(err)
        res.status(500).send("Error loading dashboard")
    }
})

// ── CONFIG ROUTES ────────────────────────────────────────────────

app.get("/api/config", async (req, res) => {
    try {
        const data = await Config.findOne().sort({ createdAt: -1 })
        res.json(data)
    } catch (err) {
        res.status(500).json({ error: "Error fetching config" })
    }
})

app.post("/config", async (req, res) => {
    try {
        // app1start / app1end / app1duration come in as MINUTES from config.ejs
        const newConfig = new Config({
            appliance1:   req.body.appliance1,
            app1start:    Number(req.body.app1start),
            app1end:      Number(req.body.app1end),
            app1duration: Number(req.body.app1duration),
            app1wattage:  Number(req.body.app1wattage) || 0,

            appliance2:   req.body.appliance2,
            app2start:    Number(req.body.app2start),
            app2end:      Number(req.body.app2end),
            app2duration: Number(req.body.app2duration),
            app2wattage:  Number(req.body.app2wattage) || 0,

            appliance3:   req.body.appliance3,
            app3start:    Number(req.body.app3start),
            app3end:      Number(req.body.app3end),
            app3duration: Number(req.body.app3duration),
            app3wattage:  Number(req.body.app3wattage) || 0,

            appliance4:   req.body.appliance4,
            app4start:    Number(req.body.app4start),
            app4end:      Number(req.body.app4end),
            app4duration: Number(req.body.app4duration),
            app4wattage:  Number(req.body.app4wattage) || 0,
        })
        await newConfig.save()
        notifyPi("config_updated")
        res.redirect("/dashboard")
    } catch (err) {
        console.error(err)
        res.status(500).send("Error saving config")
    }
})

// ── TARIFF ROUTES ────────────────────────────────────────────────

app.get("/api/tariff", async (req, res) => {
    try {
        const data = await Tariff.findOne().sort({ createdAt: -1 })
        res.json(data)
    } catch (err) {
        res.status(500).json({ error: "Error fetching tariff" })
    }
})

app.post("/tariffupdate", async (req, res) => {
    try {
        const fields = {}
        for (let h = 0; h < 24; h++) fields[`time${h}`] = Number(req.body[`time${h}`])
        const newTariff = new Tariff(fields)
        await newTariff.save()
        notifyPi("tariff_updated")
        res.redirect("/dashboard")
    } catch (err) {
        console.error(err)
        res.status(500).send("Error saving tariff")
    }
})

// ── SCHEDULE ROUTES ──────────────────────────────────────────────

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

// ── COST ROUTES ──────────────────────────────────────────────────

app.post("/api/cost", async (req, res) => {
    try {
        const log = new CostLog(req.body)
        await log.save()
        res.json({ message: "Cost log saved" })
    } catch (err) {
        res.status(500).json({ error: "Error saving cost log" })
    }
})

app.get("/api/cost", async (req, res) => {
    try {
        const days     = parseInt(req.query.days || "7")
        const since    = new Date()
        since.setDate(since.getDate() - days)
        const sinceStr = since.toISOString().slice(0, 10)
        const logs     = await CostLog.find({ date: { $gte: sinceStr } }).sort({ date: 1, hour: 1 })
        res.json(logs)
    } catch (err) {
        res.status(500).json({ error: "Error fetching cost logs" })
    }
})

app.get("/api/cost/today", async (req, res) => {
    try {
        const todayStr = new Date().toISOString().slice(0, 10)
        const logs     = await CostLog.find({ date: todayStr })
        const total    = logs.reduce((sum, l) => sum + (l.total_cost_Rs || 0), 0)
        const activeSet = new Set()
        logs.forEach(l => (l.channels || []).forEach(ch => {
            if (ch.cost_Rs > 0) activeSet.add(ch.channel)
        }))
        res.json({
            date:            todayStr,
            total_cost_Rs:   parseFloat(total.toFixed(4)),
            active_channels: activeSet.size,
            hour_count:      logs.length,
        })
    } catch (err) {
        res.status(500).json({ error: "Error fetching today cost" })
    }
})

app.get("/api/cost/daily-summary", async (req, res) => {
    try {
        const days     = parseInt(req.query.days || "7")
        const since    = new Date()
        since.setDate(since.getDate() - days)
        const sinceStr = since.toISOString().slice(0, 10)
        const logs     = await CostLog.find({ date: { $gte: sinceStr } })
        const byDate   = {}
        for (const log of logs) {
            if (!byDate[log.date]) byDate[log.date] = 0
            byDate[log.date] += log.total_cost_Rs || 0
        }
        const result = Object.entries(byDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, total]) => ({ date, total_cost_Rs: parseFloat(total.toFixed(4)) }))
        res.json(result)
    } catch (err) {
        res.status(500).json({ error: "Error computing daily summary" })
    }
})

// ── LIVE CURRENT ROUTES ──────────────────────────────────────────

app.post("/api/live-current", async (req, res) => {
    try {
        await LiveCurrent.findOneAndUpdate(
            { _key: "live" },
            { timestamp: req.body.timestamp, channels: req.body.channels, updatedAt: new Date() },
            { upsert: true, new: true }
        )
        res.json({ message: "Live current updated" })
    } catch (err) {
        res.status(500).json({ error: "Error saving live current" })
    }
})

app.get("/api/live-current", async (req, res) => {
    try {
        const doc = await LiveCurrent.findOne({ _key: "live" })
        res.json(doc || { channels: [] })
    } catch (err) {
        res.status(500).json({ error: "Error fetching live current" })
    }
})

// ── PI NOTIFICATION ──────────────────────────────────────────────
// Fire-and-forget: tell the Pi to re-run the scheduler immediately
// instead of waiting up to POLL_INTERVAL seconds to detect the change.
// Set PI_API_BASE in your environment, e.g. http://192.168.1.50:5050
const PI_API_BASE = process.env.PI_API_BASE || null

function notifyPi(reason) {
    if (!PI_API_BASE) return   // not configured — silent skip
    const http = PI_API_BASE.startsWith('https') ? require('https') : require('http')
    const url  = new URL('/api/refresh', PI_API_BASE)
    const body = JSON.stringify({ reason })
    const opts = {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    const req = http.request(opts, r => console.log(`[pi-notify] ${reason} → HTTP ${r.statusCode}`))
    req.on('error', e => console.warn(`[pi-notify] could not reach Pi: ${e.message}`))
    req.setTimeout(3000, () => { req.destroy(); console.warn('[pi-notify] timeout') })
    req.write(body)
    req.end()
}

// ── HELPERS ──────────────────────────────────────────────────────

function getLast7Days() {
    const labels = []
    const today  = new Date()
    for (let i = 7; i >= 1; i--) {
        const d = new Date(today)
        d.setDate(today.getDate() - i)
        labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }))
    }
    return labels
}
