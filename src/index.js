const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
require('dotenv').config();

/*
const mongoose = require('mongoose');
// Connect to MongoDB
const mongooseConnection = process.env.MONGOOSECONNECTION;

mongoose.connect(mongooseConnection)
.then(() => {
    console.log('MongoDB connected successfully');
})
.catch(err => {
    console.log('MongoDB connection error:', err);
});
*/
app.set('view engine', 'ejs'); // Set EJS as the templating engine
app.use(express.static(path.join(__dirname, '../public')));

// Function to match stopId to name
const matchStopIdToName = (stopId, stops) => {
    const stop = stops[stopId];
    return stop ? stop.name : null;
}

// Function to match tripId to tripHeadsign
const matchTripIdToTripHeadsign = (tripId, trips) => {
    const trip = trips[tripId];
    return trip ? trip.tripHeadsign : tripId;
}

const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString('hu-HU', {
        timeZone: 'Europe/Budapest',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}
// Helper function to get the current date in YYYYMMDD format
const getCurrentDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Adding 1 to month as it is 0-indexed
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
}

async function fetchVehiclesForRoute() {
    try {
        const apiKey = process.env.API_KEY;
        const vehiclesResponse = await axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/vehicles-for-route', {
            params: {
                routeId: 'BKK_H5',
                related: false,
                version: 4,
                includeReferences: true,
                key: apiKey
            }
        });

        const vehiclesData = vehiclesResponse.data.data;
        const vehicles = vehiclesData.list.map((vehicle, index) => ({
            index: index + 1,
            vehicleId: vehicle.vehicleId,
            tripId: vehicle.tripId,
            stopId: vehicle.stopId,
            licensePlate: vehicle.licensePlate,
            stopSequence: vehicle.stopSequence,
            status: vehicle.status,
            label: vehicle.label,
            routeId: vehicle.routeId,
            tripHeadsign: matchTripIdToTripHeadsign(vehicle.tripId, vehiclesData.references.trips),
            stopName: matchStopIdToName(vehicle.stopId, vehiclesData.references.stops),
            bearing: vehicle.bearing,
            location: {
                lat: vehicle.location.lat,
                lon: vehicle.location.lon
            },
            stopData: []  // Placeholder for stop data
        }));

        // Create promises to fetch stop details for each vehicle
        const stopPromises = vehicles.map(vehicle =>
            axios.get('https://futar.bkk.hu/api/query/v1/ws/otp/api/where/trip-details', {
                params: {
                    vehicleId: vehicle.vehicleId,
                    date: getCurrentDate(),
                    version: 4,
                    includeReferences: true,
                    key: apiKey
                }
            })
        );

        // Wait for all stop details to be fetched
        const stopResponses = await Promise.all(stopPromises);

        // Attach the stop data to each vehicle
        stopResponses.forEach((stopResponse, i) => {
            vehicles[i].stopData = stopResponse.data.data.entry.stopTimes.map(stop => ({
                stopId: matchStopIdToName(stop.stopId, stopResponse.data.data.references.stops),
                stopSequence: stop.stopSequence,
                predictedArrivalTime: formatTime(stop.predictedArrivalTime),
                predictedDepartureTime: formatTime(stop.predictedDepartureTime),
                arrivalTime: formatTime(stop.arrivalTime),
                departureTime: formatTime(stop.departureTime)
            }));
        });

        return vehicles;

    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}
/*
// Define the schema for the train
const trainSchema = new mongoose.Schema({
    Timestamp: Number,
    vonal: String,
    palyaszam: String,
    irany: String
});

// Create the model for the trains
const Train = mongoose.model('Train', trainSchema, 'Trains');

// Route to fetch train data
app.get('/logview', async (req, res) => {
    try {
        // Fetch train data from the collection
        const trainsData = await Train.find().lean();
        console.log("Fetched train data:", trainsData);  // Log the data to the console

        if (!trainsData || trainsData.length === 0) {
            return res.status(404).send('No train data found');
        }

        // Pass the fetched data to the EJS template
        res.render('logview', { trains: trainsData });
    } catch (err) {
        console.log('Error fetching train data:', err);  // Log any errors
        res.status(500).send('Error fetching train data');
    }
});
*/
// Serve the initial page
app.get('/', async (req, res) => {
    res.render('index');
});

// Map endpoint to fetch vehicle data and license plate data
app.get('/map', async (req, res) => {
    const vehicles = await fetchVehiclesForRoute();
    const licensePlatesData = JSON.parse(fs.readFileSync('./data/licensePlates.json', 'utf8'));

    if (vehicles) {
        // Pass both vehicles and licensePlates to the client
        res.json({ vehicles, licensePlates: licensePlatesData });
    } else {
        res.status(500).send('Error fetching vehicle data');
    }
});

const PORT = process.env.PORT || 3000; // Use environment port or default to 3000
var server = app.listen(PORT, () => {
    server.setTimeout(500000); // Set timeout to 500 seconds (500,000 milliseconds)
    console.log(`Server is running on port ${PORT}`);
});
