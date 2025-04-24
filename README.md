# Suportsaper - Online Store Project (ITCS223 Phase II)

This project is a web application for an online sports store called "Suportsaper". It was created for the ITCS223 Introduction to Web Development course.

This project includes:
*   A website for customers to browse and search for products.
*   An admin area for managing products and viewing information.
*   A backend server using Node.js to handle data and logic.
*   A database to store product and admin information.

## Team Members

*   Bhumipat Pengpaiboon
*   Krerkkiat Wattanaporn
*   Napas Siripaskrittakul
*   Phonchanit Chaithammachok
*   Nunnapat Vitinuntakit

## Features

*   **Home Page:** Shows featured products and new arrivals ([`/html/home.html`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\html\home.html)).
*   **Search Page:** Allows users to search for products by name, category, etc. ([`/html/search.html`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\html\search.html)).
*   **Product Detail Page:** Shows details for a single product ([`/html/detail.html`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\html\detail.html)).
*   **Admin Login:** Secure login page for administrators ([`/html/adminlogin.html`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\html\adminlogin.html)).
*   **Product Management (Admin):** Allows admins to view products ([`/html/product.html`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\html\product.html)).
*   **Inventory Management (Admin):** Allows admins to add new products with images ([`/html/inventory.html`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\html\inventory.html)).
*   **Admin Account (Admin):** Allows admins to view/edit their profile ([`/html/adminaccount.html`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\html\adminaccount.html)).
*   **Team Page:** Information about the development team ([`/html/team.html`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\html\team.html)).
*   **Debug Page (Admin):** A page for running database queries for debugging ([`/html/debug.html`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\html\debug.html)).
*   **Backend API:** Handles requests for data (login, products, images) using Node.js and Express ([`/app.js`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\app.js)).
*   **Database:** Uses SQLite to store data ([`/database.js`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\database.js), [`/database/database.sqlite`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\database\database.sqlite)).

## Librarys and Service Used

*   **Frontend:** HTML, CSS, JavaScript, Bootstrap 5
*   **Backend:** Node.js, Express.js
*   **Database:** SQLite3
*   **File Uploads:** Multer
*   **Environment Variables:** dotenv
*   **Development:** Nodemon
*   **Public API** Longdo Map

## Setup and Installation

1.  **Reminder:** Make sure you have Node.js and npm installed on your computer.
2.  **Clone the Repository:** Get the project files onto your computer.
3.  **Navigate to Project Directory:** Open a Visual studio code or terminal and go into the server folder:
4.  **Install Dependencies:** Run this command to install the necessary libraries listed in [`/package.json`](c:\Users\ICB_Server\Desktop\WEB\Cloudy_Website\package.json):
    ```sh
    npm install cookie-parser express express-session multer sqlite3
    ```
5.  **Database:** The SQLite database file (`database.sqlite`) is located in the `/database/` directory.
6.  **Product Pictures:** Please download the product picture from [This link](https://drive.icebearbares.i234.me/d/s/133kWxn7EWzSLf2NuMKkI0VwmwWxMw9O/gOgje4MdHPm-zWHrAcfFOgrGUT3K7FzT-NbcAer87Ogw). Product images should be stored in this path `/database/pictures`.

## How to Run

1.  **Start the Server:** Open a terminal in the directory and run:
    ```sh
    npm start app.js
    ```
    This uses `nodemon` to start the server, which will automatically restart if you make changes to the code.
2.  **Access the Website:** Open your web browser and go to http://localhost:3030.
3.  **Access Admin Pages:** Navigate to `/adminlogin` to log in as an administrator. Admin-only pages like `/product`, `/inventory`, `/adminaccount`, and `/debug` require login.

## Notes

*   This project uses separate frontend (HTML/CSS/JS) and backend (Node.js) components.
*   The backend provides API endpoints that the frontend uses to get and manage data.
*   Admin authentication is handled using sessions.