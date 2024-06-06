import mysql from "mysql2";

const connection = mysql.createConnection({
    host: "35.205.167.196",
    user: "root",
    password: ";kA_LY<$oEH4FEux",
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