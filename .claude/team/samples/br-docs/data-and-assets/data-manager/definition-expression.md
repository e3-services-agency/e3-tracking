---
updatedAt: 2026-07-16T09:27:30.000Z
---

Fetch the complete documentation index at: https://documentation.bloomreach.com/engagement/llms.txt. Use this file to discover all available pages before exploring further. Append .md to any documentation page URL to get its markdown version.

# Expressions

An expression is a formula you can create for customers or events. It works as a derived attribute, combining multiple attributes to further specify or categorize customers and events. Expressions for events work as event attributes, while expressions for customers work as customer attributes.

## Create an expression

1. Go to **Data & Assets > Data manager > Definitions > New definition > Expression**. This opens the expression editor.

<Image src="https://files.readme.io/2d5bde5-Screen_Shot_2019-06-07_at_09.25.33.png" alt="The expression editor with the formula input field, attribute, and function buttons." align="center" caption="The expression editor with the formula input field, attribute, and function buttons." border={true} />

2. Select whether you want to derive the expression for a customer or event attribute. The same logic applies as with [aggregates and running aggregates](https://documentation.bloomreach.com/engagement/docs/aggregates-and-running-aggregates).

3. Type the formula into the field, or use the buttons to add attributes and functions and then edit them.

Expressions consist of 4 main components: attributes, functions, operators, and strings.

### Attributes

Attributes are customer or event attributes, aggregates, or running aggregates that were either defined previously or created directly from the expression builder. They provide the values for the formula.

You can use up to 26 attributes in a single expression. If you need more, split the formula into multiple expressions and build a final expression from them.

### Functions

Functions take values from attributes and return a result based on the input. The following functions are available:

| Function      | Description                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abs(A)`      | Returns the absolute value of `A`.                                                                                                                             |
| `concat(A,B)` | Concatenates two strings. To concatenate more than two strings, nest multiple calls, for example `concat(concat(A, B), concat(C, D))`.                         |
| `exp(A)`      | Returns an exponential `eˆA` where `e` is [Euler's number](https://www.datacamp.com/tutorial/eulers-number).                                                   |
| `max(A,B)`    | Returns the larger of two values. To compare more than two values, nest multiple calls, for example `max(max(A, B), max(C, D))`.                               |
| `min(A,B)`    | Returns the smaller of two values. To compare more than two values, nest multiple calls, for example `min(min(A, B), min(C, D))`.                              |
| `ifnull(A,B)` | Returns `A` if it is set. Returns `B` if `A` is not set. To check more than two values, nest multiple calls, for example `ifnull(A, ifnull(B, ifnull(C, D)))`. |
| `floor(A)`    | Returns the largest integer less than or equal to `A`. For example, `floor(1.9)=1`.                                                                            |
| `ceil(A)`     | Rounds `A` upwards. For example, `ceil(1.4)=2`.                                                                                                                |
| `lower(A)`    | Returns the lower bound of dimension `A`.                                                                                                                      |
| `upper(A)`    | Returns the upper bound of dimension `A`.                                                                                                                      |
| `round(A)`    | Rounds `A` to the nearest integer. For example, `round(1.9)=2`.                                                                                                |
| `ln(A)`       | Returns the natural logarithm of `A`.                                                                                                                          |
| `now()`       | Returns the current timestamp.                                                                                                                                 |
| `length()`    | Counts the number of values in a list, or the number of characters in a string.                                                                                |
| `sqrt(A)`     | Returns the square root of `A`.                                                                                                                                |
| `power(A,B)`  | Returns the power of a value, with `A` as the base and `B` as the exponent.                                                                                    |

### Operators

Operators are basic mathematical functions for adding, subtracting, and other calculations on the expression components. Type these manually using your keyboard.

### Strings

To add text to your expression, wrap it in quotation marks, for example: `"My text"`. Use `\` to escape characters, for example: `"My \"interesting\" text"` — this includes the quotation marks in your text.

## Use expressions

Once you create an expression, it appears as an attribute of the event or customer attribute you defined it for. For example, if you define an expression for the `session_start` event, it appears as one of its attributes whenever you work with filters, reports, and so on.

If you don't see your expression in the list, make sure you're working with the correct event or attribute and within the same initiative.

<Image src="https://files.readme.io/1b89488-Expression_use.png" alt="1400" align="center" width="80%" caption="An expression appearing as an event attribute in filters and reports." border={true} />

## Use cases

Expressions are useful when further specifying events or customers in segmentations, reports, funnels, and more. You can use them similarly to other attributes by comparing them to a constant value or to other attributes. Common use cases include:

* Setting a simple value that multiple attributes are compared against. When you need to change the compared value, you only update the expression rather than changing every condition individually.
* Attributing revenue to specific actions. To evaluate the effectiveness of a newsletter, weblayer, or another campaign, you can count only purchases that occur within a specific time after the action. Define an expression for the purchase event, set it to the timestamp minus a running aggregate of the last banner timestamp, and then compare it to your desired value.

<Image src="https://files.readme.io/de0be93-expression-example.jpg" alt="An expression evaluating the time between a banner impression and a purchase." align="center" caption="An expression evaluating the time between a banner impression and a purchase." border={true} />

## Example: Floor last `cart_update` timestamp

Get the timestamp of the last `cart_update` event, stripping any decimal numbers.

<Image src="https://files.readme.io/12b339665ee42892218f6e03d07a9a4fac22739362add6edf5c3ca782f0fbd2f-Expressions_cart_update.gif" alt="Configuring the floor last cart_update timestamp expression." align="center" caption="Configuring the floor last cart_update timestamp expression." border={true} />

<br />