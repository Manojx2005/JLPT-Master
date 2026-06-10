# Firebase Security Guide

Before we publish to GitHub, follow these exact steps to lock down your Firebase database so nobody can steal your quotas or ruin your leaderboard!

## Step 1: Apply Database Security Rules
By default, your database might be completely open to the internet. We need to tell Firebase that only logged-in users can update their own scores.

1. Go to the [Firebase Console](https://console.firebase.google.com/) and open your `jlpt-master-4cbf2` project.
2. On the left menu, click **Build > Realtime Database**.
3. At the top of the screen, click the **Rules** tab.
4. Delete everything in the text box.
5. Open the `database.rules.json` file I just generated in this folder. Copy all of the text inside it, and paste it into the Firebase Rules text box.
6. Click the blue **Publish** button.

*Your database is now secure! Bots can no longer write fake data.*

## Step 2: Restrict your API Key
Since your API key will be public on GitHub, we need to tell Google to reject any requests that use this key *unless* the request is coming specifically from your website url.

1. Go to the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Make sure you are logged into the Google Account that owns the Firebase project, and select the `jlpt-master-4cbf2` project from the dropdown at the top.
3. Under the "API Keys" section, click on the key (it's usually named "Browser key (auto created by Firebase)").
4. Scroll down to **Application restrictions**.
5. Select **HTTP referrers (web sites)**.
6. Click **ADD AN ITEM**.
7. In the box, type your future website URL (For example, if you are publishing to GitHub Pages, type `*yourusername.github.io/*`).
   - *Note: Add `http://localhost:*` as a second item so you can still test it on your own computer!*
8. Click **Save** at the bottom.

*Your API key is now secure! Even if someone copies it from GitHub, it will instantly fail if they try to use it on their own website.*
