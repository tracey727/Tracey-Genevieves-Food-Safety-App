# GENEVIEVE App™ Smart Shop

Private personal-use fortnightly shopping planner for comparing user-entered Coles and Woolworths prices and maintaining a coeliac-safe approved product list.

## Important design choices

- No automatic scraping or retailer account access.
- No retailer passwords are stored.
- Data stays in browser local storage.
- JSON backup and restore are included.
- The app only recommends products marked Approved.
- Price, stock and ingredient information must be rechecked against the retailer and package.

## Run locally

Open `index.html` in a browser, or serve the folder with any static web server.

## Deploy on Vercel

1. Create a new GitHub repository.
2. Upload all files from this folder to the repository root.
3. In Vercel, choose **Add New > Project** and import the repository.
4. Framework preset: **Other**.
5. Build command: leave blank.
6. Output directory: leave blank or use `.`.
7. Deploy.

Because this is a static app, no environment variables are required.

## Private-use warning

A public Vercel URL can technically be visited by anyone who knows it. The in-app passcode protects against casual access but is not server authentication. For stronger private access, use Vercel Deployment Protection if available on your plan, or add a proper authentication backend before storing sensitive information.
