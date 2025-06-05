# 🌞 Solar Dashboard Backend

- authentication (admin/user) with JWT
- Automatically fetching KPI data from the Huawei FusionSolar API every day at 22
-  Storing the KPI data in MongoDB Atlas
- Providing API endpoints to frontend for real-time KPI display

---

## Tech Stack

- **Node.js + Express**
- **MongoDB + Mongoose**
- **Axios + Cookie Jar** for FusionSolar session handling
- **Node-cron** for scheduled data fetch

---

## 
🔧 .env

```
PORT=5000
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/kpidb
JWT_SECRET=solar_secret
FUSION_USERNAME=<fusion_username>
FUSION_PASSWORD=<fusion_password>
```

---

## 🧪 Run Locally

```bash
cd server
npm install
cp .env.template .env
node server.js
```
