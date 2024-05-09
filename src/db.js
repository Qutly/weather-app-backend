import mysql from "mysql2";

const connection = mysql.createConnection({
    host: "35.233.21.73",
    user: "root",
    password: "LFzEQ{}Pj:sT@y_U",
    port: 3306,
    database: "weather-database"
})

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database: ', err);
        return;
    }
    console.log('Connected to MySQL database');
});

export default connection;