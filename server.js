const express = require('express');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const cors = require('cors');
const admin = require('firebase-admin');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

// Replace './path/to/serviceAccountKey.json' with the path to your downloaded key
const serviceAccount = require('./config/idadogwebsite-firebase-adminsdk-fbsvc-bc91c86757.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://IdaDog.firebaseio.com', // Replace with your project's database URL
});

const db = admin.firestore();

app.post('/send-email', (req, res) => {
    const { to, subject, html } = req.body;

    const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Email sent: ' + info.response);
            res.send('Email sent successfully');
        }
    });
});

app.get('/confirm-reservation', async (req, res) => {
    try {
        // Extract query parameters
        const { n: name, p: phone, s: start, e: end, st: startTime, et: endTime } = req.query;

        if (!name || !start || !end) {
            return res.status(400).send('Missing required fields');
        }

        // Save to Firebase (Firestore example)
        await db.collection('reservations').add({
            name,
            phone,
            start,
            end,
            startTime: startTime || null,
            endTime: endTime || null,
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Send a success message
        res.send(`
            <html>
                <body style="font-family: sans-serif; text-align: center;">
                    <h1>Reservation Confirmed!</h1>
                    <p>Thank you for confirming your reservation. We're excited to serve you ${name}!</p>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error confirming reservation:', error);
        res.status(500).send('Error confirming reservation');
    }
});

app.get('/reservations', async (req, res) => {
    try {
        const reservationsSnapshot = await db.collection('reservations').get();

        // Convert Firestore documents to an array of objects
        const reservations = reservationsSnapshot.docs.map((doc) => ({
            id: doc.id, // Include document ID for reference
            ...doc.data(),
        }));

        res.status(200).json(reservations);
    } catch (error) {
        console.error('Error retrieving reservations:', error);
        res.status(500).send('Failed to retrieve reservations');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});