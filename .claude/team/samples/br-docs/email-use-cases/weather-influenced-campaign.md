---
updatedAt: 2026-07-28T10:31:50.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Weather Influenced Campaign

[block:html]
{
  "html": "<div class=\"feature-integrations-wrapper\">\n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/a8d39c9-Group_6991.svg\"/>\n      \t<img src=\"https://files.readme.io/1482713-1._Clock_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case maturity: \n        <p>Advanced</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/3762a90-Group_7035.svg\"/>\n      \t<img src=\"https://files.readme.io/0d9bb6e-2._Laptop_Icon.svg\" class=\"icon\"/>\n      </div>\n      <p>What to expect: \n        <p>Revenue</p>\n    </a>\n  </div>\n  \n  <div class=\"card-with-icon-wrapper\">\n     <a class=\"card-with-icon-item card-with-icon-item-1\">\n      <div class=\"icons-wrapper\">\n      \t<img src=\"https://files.readme.io/9fae711-Group_7036.svg\"/>\n      \t<img src=\"https://files.readme.io/a8fee62-3._Results.svg\" class=\"icon\"/>\n      </div>\n      <p>Use Case goal: \n        <p>Retention</p>\n     \n    </a>\n  </div>\n</div>\n\n<style>\n  \n</style>"
}
[/block]

[block:html]
{
  "html": "<div class=\"Sidebar-listWrapper6Q9_yUrG906C rm-Sidebar-section\"></div>"
}
[/block]

## Use case description

The [Weather Influenced Campaign](https://www.bloomreach.com/en/products/engagement/plug-and-play/weather-influenced-campaign) use case automatically updates your catalog with the latest weather data for key customer locations, informing your campaigns to match your customers' current climate. This can help deliver relevant experiences by personalizing offers and messages for your customers using real-time weather data.

> 👍 Note
>
> Interested in implementing this use case? Contact your Customer Success Manager to discuss how it can be tailored for your business.

## Use case items

With this use case, you’ll get:

* Aggregate
  * **Most Recent City:** Provides the last city where the customer created a `session_start` event.
* Report
  * **Most frequent cities:** Provides the names and counts of the common customer cities (cities with the most `session_start` events) for the last 7 days.
  * **City Coordinates:** Provides the names and coordinates of the most common customer cities for the last 60 days.
* Segmentation
  * **Weather City segmentation:** Segments System Customers (cities) into segments according to how many customers opened the client's website from them within the last 7 days.
* Snippet
  * **Return City Weather:** Provides a string with weather information and takes Weather Catalog Name and City Name as input.
* Scenario
  * **Upload Weather to Catalog:** Finds all system customers representing cities and updates their properties and corresponding weather catalog with current weather information.
  * **Clear Sky Campaign:** Example campaign.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/7f7a7b845c05f2d94718ed1816d1d06ca1b82e3ad9e4fc669610a74bef231b58-UC_-_Weather_Influenced_Campaign.png",
        null,
        ""
      ],
      "align": "center"
    }
  ]
}
[/block]

## How to deploy the use case

After downloading the use case, follow these steps.

### Meet the requirements

Check if the data in your project [meets the requirements](https://documentation.bloomreach.com/engagement/docs/how-to-meet-the-requirements). The Use Case Center lists requirements for each use case during the deployment process.

> 📘 Note
>
> **Webhooks** are a hard requirement because this use case requires contact to external API to get the current weather for wanted cities.
>
> **Catalogs** and **Automated Imports** are required to store the current weather.

### Understand the use case logic

This use case regularly (by default daily) updates the customer's catalog with current weather data for the most common locations. The use case builds a report of the most common cities (the cities from where we receive most `session_start` events). Then, it takes at most 1000 of the cities and asks an external Weather API for weather forecasts in these locations.

This process is fully automated and doesn't involve any further intervention after the use case is deployed. However, you can change the frequency of weather updates and the number of cities you want to include.

### Set up Weather

#### Set up Reports

Ensure your reports are configured to return the most common cities relevant to your project. No changes are typically necessary.

#### Create a weather data catalog

Create a catalog named `WeatherData` to store weather information.

Go to **Catalogs > Add Catalog** and name the catalog WeatherData. Press **Next** and input the following data format:

`item_id,city,latitude,longitude,weatherCount,weatherTimestamp,dt,sunrise,sunset,summary,temp_min_fahrenheit,temp_min_celsius,temp_max_fahrenheit,temp_max_celsius,pressure,humidity,wind_speed,clouds,pop,uvi,rain,snow,weatherMain,weatherDescription,weatherAlerts,temp_min,temp_max`

`New York,New York,48.25,14.06,13,1693245320.00,[],[],[],[],[],[],[],[],[],[],[],[],[] ,[],[],[],[],[],[],[],[]`

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/eb2b1294a729949bd339b0cc937f097a2bfb0bd392903725a62a78a66ddbfa80-weather-data-format.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

Your catalog should look like this:

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/e4e5c982763d96b4a70bd8e36cacb704037105c077a8cfc234a37ebdf9621bff-weather-data-catalog.png",
        "",
        ""
      ],
      "align": "center",
      "border": true
    }
  ]
}
[/block]

Ensure all attributes used for weather data storage are of type List. They will store data for today and the next seven days. The first list entry represents current weather, the second entry represents tomorrow's forecast, and so on.

The only attributes that should **not** be of type List are:

* `item_id` = Text
* `city` = Text
* `lattitude` = Number
* `longitude` = Number
* `weatherCount` = Number
* `weatherTimestamp` = Number

#### Set up automated import

Configure an automated import to create customer profiles from the Most Frequent Cities report. Use the city name as both an attribute and ID.

Import `WeatherCount` and `WeatherTimestamp` as well. Schedule the import during off-peak hours to avoid platform overload, such as early morning.

> 🚧 Important
>
> Run this import before the "Upload Weather to Catalog" scenario, as it relies on updated customer profiles.

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/b2f378adeba5a000888c7865fc71b200c1ab8fe9b96a0ef15fc49a3f0fbf2a84-Data-source-for-customers.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "700px",
      "border": true
    }
  ]
}
[/block]

[block:image]
{
  "images": [
    {
      "image": [
        "https://files.readme.io/e35108dcea55ef0455dbbcb81a5d307767650f8238ae37205071409523055770-Data-mapping.png",
        "",
        ""
      ],
      "align": "center",
      "sizing": "700px",
      "border": true
    }
  ]
}
[/block]

#### Adjust the Upload Weather to catalog scenario

The Upload Weather to Catalog scenario must be adjusted and updated with customer-specific API keys.

**GetTheDataFromTheWeatherAPI:** Obtain a unique API key for each customer to ensure accountability in case of policy breaches.

**Weather API**

Use the free [OpenWeather](https://home.openweathermap.org/users/sign_in) API, which allows up to 1000 free daily requests. Register at OpenWeather and add a credit card to get your API key. No charges will apply if you stay within the free limits.

**UpdateWeatherCatalog:** Update the URL with your project token and catalog ID and create an authentication method for editing and adding catalog items.

#### Create logic for the weather data

Develop logic to use weather data in campaigns. For example, the Clear Sky Campaign can target customers in cities with clear skies. If you are reusing this campaign, adjust aggregate and catalog IDs.

**Scenario steps:**

1. Run the scenario on your customers.
2. Access the `WeatherData` catalog and use wait nodes to manage load, especially for large customer bases.
3. Filter customers living in frequent cities with updated weather data (use a [Jinja](https://documentation.bloomreach.com/engagement/docs/jinja) snippet to verify city and weather update within 24 hours).
4. Retrieve each customer's current weather based on their last session start event. Filter customers based on desired weather conditions, such as specific pressure or temperature forecasts.
5. Send the targeted campaign to the filtered customers.

### Adjust the use case

Now that you understand the use case logic, you can set up the use case according to your needs.

#### Email settings

Access the email and go to the **Settings** tab to adjust the [email settings](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings).

If you decide to customize the email settings, follow [this detailed guide](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center#settings) to make the adjustments.

#### Design and copy

Customize the [email visuals and copy](https://documentation.bloomreach.com/engagement/docs/how-to-adjust-the-email-design-and-settings-in-the-use-case-center) to reflect your company's brand identity.

Follow [this](https://documentation.bloomreach.com/engagement/docs/customize-the-email-node-in-use-case-center) guide to adjust the email template with products in the email node.

#### A/B test

[A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests) the use case to better understand the email performance and revenue generated.

This use case's A/B test traffic distribution is set to Bloomreach's best practices, where 50% of customers receive the 'Abandoned Cart Email with Recommendations' email (Variant A), and  50% of customers do not (Control Group).

Learn more about the do's and don'ts of [modifying A/B test](https://documentation.bloomreach.com/engagement/docs/ab-tests#prepare-for-an-ab-test).

### Test and run the use case

Test a use case before deploying it. [Testing](https://documentation.bloomreach.com/engagement/docs/how-to-test-the-email-in-the-use-case-center) ensures you don't send unfinished or imperfect campaigns to your customer base.

Once the testing is over, run the use case. Open the banner and click **Start** to launch the campaign.

### Evaluate the results

Remember to run the use case for a few days to see the impact.

After this initial period, use the prebuilt Data Overview to measure and analyze relevant data and press **Refresh** to see the results.

Check campaign results regularly to optimize performance.

## Other resources

Learn how to [enhance and optimize email](https://documentation.bloomreach.com/engagement/docs/how-to-enhance-a-use-case-in-the-use-case-center) performance with different tips and tricks from Bloomreach experts.