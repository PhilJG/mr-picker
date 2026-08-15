# Mr Picker

The intention here is to pull headlines from a news api and grade it based on the relevance to the stock market

## Running Locally

Requires a `.env` file with `NYT_API_KEY` and `OPENAI_API_KEY` set.

```bash
npm install
npm start
```

This runs `nodemon server.js`, which listens on port 3000 (or `$PORT` if set) and restarts on file changes.

In a separate terminal, test the endpoints:

```bash
curl http://localhost:3000/api/sections
curl "http://localhost:3000/api/articles/technology?limit=3&offset=0"
```

## It should do the following in order

1. Scan and filter the NWT API

   1. Filter results with chatgpt based on relenace to the market
   2. Figue out which industries this is relvant
   3. Push 1 - 2 to a db

2. Review results and select stocks based on the industry and releance

   1. Look for potential and corriletie stock along with past financial potential

3. Fake trad based on that information

## Techonogies and techniques to look into

- **_Alpha Advantage Api_** for pulling stock data
- **_Math Random_** for random IP proxy rotator
- **_Cron Job_** continously running locally
- **_Inestopedia Fake Trading Account_**

## To Do

### Add a tracker that updates each time a new article comes out.

### Review headline and skip if not relevant. Otherwise push abstract

​The New York Times Newswire API provides an up-to-the-minute stream of articles and blog posts as they are published on NYTimes.com. This means new content becomes available through the API immediately upon publication. The frequency of updates depends on the volume of articles the Times publishes, which can vary throughout the day. For example, one application utilizing the Newswire API is configured to collect the latest news every 20 minutes, though this interval can be adjusted based on specific needs. Therefore, the API is designed to provide real-time access to new articles as they are released.​
