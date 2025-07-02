require('dotenv').config();
const axios = require('axios');
const nodemailer = require('nodemailer');
const express = require('express');
const app = express();

// Keep the server alive (Render needs this)
app.get('/', (req, res) => res.send('✅ MLB Error Bot is alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Express server running on port ${PORT}`));

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
const EMAIL_TO = process.env.EMAIL_TO.split(',');

const seenPlays = new Set();

async function getGamePKs() {
  const today = new Date().toISOString().split('T')[0];
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}`;
  const res = await axios.get(url);
  return res.data.dates[0]?.games.map(g => g.gamePk) || [];
}

async function getPlays(gamePk) {
  const url = `https://baseballsavant.mlb.com/gf?game_pk=${gamePk}`;
  const res = await axios.get(url);
  return res.data?.allPlays || [];
}

async function getGameData(gamePk) {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
  const res = await axios.get(url);
  return res.data?.gameData;
}

async function checkGames() {
  console.log(`⏱️ checkGames() running at ${new Date().toLocaleTimeString()}`);

  const gamePks = await getGamePKs();
  console.log(`📌 Found ${gamePks.length} games`);

  for (const pk of gamePks) {
    try {
      const plays = await getPlays(pk);
      console.log(`🔍 Checking GamePK ${pk} with ${plays.length} plays`);

      const gameData = await getGameData(pk);
      const homeTeamSlug = gameData?.teams?.home?.name.toLowerCase().replace(/\s+/g, '-') || 'home';
      const awayTeamSlug = gameData?.teams?.away?.name.toLowerCase().replace(/\s+/g, '-') || 'away';
      const gameLink = `https://www.mlb.com/gameday/${awayTeamSlug}-vs-${homeTeamSlug}/${pk}`;

      for (const play of plays) {
        const id = `${pk}-${play.startTime}`;
        if (seenPlays.has(id)) continue;

        const event = play.result?.event?.toLowerCase();
        if (!event?.includes('error')) continue;

        seenPlays.add(id);

        const batter = play.matchup?.batter?.fullName || 'Unknown';
        const exitVelo = play.hitData?.exitVelocity || 'N/A';
        const launchAngle = play.hitData?.launchAngle || 'N/A';
        const xba = play.hitData?.expectedBattingAverage || 'N/A';
        const baseReached = play.result?.base?.toUpperCase() || play.result?.event || 'Unknown';
        const home = play.matchup?.homeTeamName || 'Home';
        const away = play.matchup?.awayTeamName || 'Away';

        const inning = play.about?.inning || 'N/A';
        const half = play.about?.halfInning || '';
        const outs = play.count?.outs ?? '0';
        const timestamp = `${half.charAt(0).toUpperCase() + half.slice(1)} ${inning}, ${outs} out${outs === 1 ? '' : 's'}`;

        const msg = `MLB Error Alert:
Batter: ${batter}
Teams: ${away} @ ${home}
Exit Velo: ${exitVelo} mph
Launch Angle: ${launchAngle}°
xBA: ${xba}
Result: ${baseReached}
Situation: ${timestamp}
Watch: ${gameLink}`;

        console.log('📬 Sending alert:', msg);

        try {
          for (const email of EMAIL_TO) {
            const mailOptions = {
              from: process.env.EMAIL_USER,
              to: email.trim(),
              subject: 'MLB Error Alert',
              text: msg,
            };

            await transporter.sendMail(mailOptions);
            console.log(`✅ Email sent to ${email.trim()}`);
          }
        } catch (err) {
          console.error(`❌ Error sending email for game ${pk}:`, err.message);
        }
      }
    } catch (err) {
      console.error(`❌ Error checking game ${pk}:`, err.message);
    }
  }
}

console.log('✅ MLB Error Bot starting...');
setInterval(checkGames, 5000);

// ✅ TEST ONLY: Send a one-time test email on startup
async function testEmail() {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: '✅ Test Email from MLB Error Bot',
    text: 'If you got this, your Render email setup WORKS!'
  };

  await transporter.sendMail(mailOptions);
  console.log('✅ Test email sent!');
}

testEmail();
