---
updatedAt: 2026-07-16T09:27:30.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Event segmentations

## Event segmentations

Event segmentations are similar to [customer segmentations](https://documentation.bloomreach.com/engagement/docs/segmentations). They are used to create custom groups of events based on various event attributes. Event segments are created for one specific event. They cannot combine groups of different events. Their aim is to better categorize events for further use in other analyses, making your work easier and your data clearer.

Event segmentation is an attribute of the specific event it is derived from. Customer segmentation is a customer attribute.

> 🚧
>
> It isn't possible to call for event segmentations with Jinja.

## Use case example

To find out what device (mobile, desktop, and tablet) customers use to browse your website, use event segmentation. The attribute `device` of the event `session_start` tracks values such as "iPhone", "Android", and "BlackBerry". We can create an event segmentation with only 3 possible values (mobile, desktop, and tablet) and group all the other values only under these 3 categories.

Once you create a report and want to see the number of visitors on mobile, select your event segmentation with the value "mobile" instead of selecting all the possible values manually (for example, iPhone, Android).

## Create event segmentations

Event segmentations are created in the `Data & Assets` > `Data Manager` > `Definitions` > `New definition`.

1. Select the event you want to work with. You can only work with one event in all segments within the segmentation.
2. Select the attribute and its values that will constitute the first segment. Read our guide about [Filtering data](https://documentation.bloomreach.com/engagement/docs/use-filters) if you need to understand how to work with the filters.
3. Add a new segment by clicking on the `+` button in the upper part of the editor.

> 👍
>
> If the segment is going to be similar to the previous one, you can save some time by duplicating the first segment and then editing its values. You can do this by hovering over the segment tab and clicking on the duplication icon next to its name.

4. Make sure your tabs are ordered correctly as every event can only belong to a single segment. In case there is an overlap in the conditions within your segmentation (one event could belong to more than one segment), it will fall within the first segment from the left side. Note that if you define one segment by multiple attributes (by clicking on the "Refine more" button), they are connected with AND logic, meaning only events fulfilling all the conditions will fall within that segment. This can be worked around by combining a segmentation within another segmentation.
5. If needed, assign your event segmentation to appropriate [initiative and add tags](https://documentation.bloomreach.com/engagement/docs/initiatives).

![](https://files.readme.io/620dbee-Event_segmentation.png "Event segmentation.png")

## Event segmentation attributes

Once you save your event segmentation, it will appear as an attribute of the event you defined it for. Using the example from the screenshot above - that segmentation will appear as an attribute of the event `session_start` called `Device segmentation`. This attribute will have 3 possible values:

* Mobile
* Desktop
* Tablet
* In the lists of attributes, event segmentations are grouped together in their own category.

![](https://files.readme.io/4de6d09-Event_segmentations_using.png "Event segmentations_using.png")

If you cannot see your segmentation in the list, check if you are working:

* With the same event.
* Within the same [initiative](https://documentation.bloomreach.com/engagement/docs/initiatives) or your segmentation has been marked as "global".