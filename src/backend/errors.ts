/**
 * Backend error types for explicit HTTP handling.
 * Zero silent failures: map these to 4xx/5xx and JSON bodies in routes.
 */

export class ConflictError extends Error {
  readonly code: string = 'CONFLICT';
  constructor(message: string, public readonly details?: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DatabaseError extends Error {
  readonly code = 'DATABASE_ERROR';
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/** Optional structured context for enum / field validation (HTTP 400 body). */
export type BadRequestDetails = {
  property_id: string;
  value: unknown;
  allowed: string[];
};

/** Invalid client payload (400). */
export class BadRequestError extends Error {
  readonly code: string = 'BAD_REQUEST';
  constructor(
    message: string,
    public readonly field?: string,
    public readonly details?: BadRequestDetails
  ) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/**
 * Blank/invalid field on an otherwise well-formed request (400). Subclass of `BadRequestError`
 * so `routeErrors.ts`'s `instanceof BadRequestError` check already maps it; its own class and
 * code exist so callers (and tests) can tell "you sent something empty" apart from other 400s
 * without inspecting the message (fix round finding #7: validation must be 400, not 409).
 */
export class ValidationError extends BadRequestError {
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'ValidationError';
  }
}

/**
 * EventProperty.role is `discriminator` or `context` but the property has no `allowed_values_json`
 * (D-03, D-16; T-1-04 delta). 400.
 */
export class RoleRequiresEnumError extends BadRequestError {
  readonly code = 'ROLE_REQUIRES_ENUM';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'RoleRequiresEnumError';
  }
}

/** An event already has two `discriminator`-role properties (D-03 rule 3; T-1-04 delta). 400. */
export class MaxDiscriminatorsError extends BadRequestError {
  readonly code = 'MAX_DISCRIMINATORS';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'MaxDiscriminatorsError';
  }
}

/**
 * A `Variant.conditions_json` entry names a property that is not linked to the event with role
 * `discriminator` (D-03; T-1-05). 400.
 */
export class ConditionNotDiscriminatorError extends BadRequestError {
  readonly code = 'CONDITION_NOT_DISCRIMINATOR';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'ConditionNotDiscriminatorError';
  }
}

/** A `Variant.conditions_json` entry names a value outside the property's `allowed_values_json` (T-1-05). 400. */
export class ConditionValueNotAllowedError extends BadRequestError {
  readonly code = 'CONDITION_VALUE_NOT_ALLOWED';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'ConditionValueNotAllowedError';
  }
}

/**
 * Two conditions in the same `Variant.conditions_json` name the same discriminator property
 * (fix round T-1-05 ERROR 1): even a contradiction like `action=add, action=remove` used to be
 * silently accepted. 400.
 */
export class ConditionDuplicatePropertyError extends BadRequestError {
  readonly code = 'CONDITION_DUPLICATE_PROPERTY';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'ConditionDuplicatePropertyError';
  }
}

/**
 * An `EventProperty.role` is changed away from `discriminator`, or the link is detached/omitted
 * from a replace, while a `Variant` of the event still conditions on that property (fix round
 * T-1-05 ERROR 2; D-03 rule 2). 400.
 */
export class DiscriminatorInUseError extends BadRequestError {
  readonly code = 'DISCRIMINATOR_IN_USE';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'DiscriminatorInUseError';
  }
}

/**
 * `Project.standard_event_additions_json` names a key that collides with a `bloomreach.ts` seed
 * key or another addition already in the array (fix round T-1-05 WARNING 3). 400.
 */
export class StandardEventExistsError extends BadRequestError {
  readonly code = 'STANDARD_EVENT_EXISTS';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'StandardEventExistsError';
  }
}

/**
 * `StandardEventMapping.standard_event` is not one of the `bloomreach.ts` seed keys or this
 * project's `standard_event_additions_json` (D-26; T-1-05). 400.
 */
export class UnknownStandardEventError extends BadRequestError {
  readonly code = 'UNKNOWN_STANDARD_EVENT';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'UnknownStandardEventError';
  }
}

/**
 * `Property.allowed_values_json` would be emptied, or would drop a value, while the property is
 * still linked with role `discriminator`/`context` on one or more events (T-1-04 fix round
 * ERROR 3; domain rule 1). 400.
 */
export class EnumInUseError extends BadRequestError {
  readonly code = 'ENUM_IN_USE';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'EnumInUseError';
  }
}

/**
 * A `Requirement.target_kind` and its target id columns (`property_id`/`event_id`/`variant_id`)
 * do not match the shape that kind requires, or a target id does not belong to this project, or
 * (for `event_property`/`variant_property`) the property is not linked to the target's event
 * (T-1-07). 400.
 */
export class RequirementTargetInvalidError extends BadRequestError {
  readonly code = 'REQUIREMENT_TARGET_INVALID';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'RequirementTargetInvalidError';
  }
}

/**
 * Two rows in the same `PUT /use-cases/:id/requirements` list resolve to the same target
 * (`target_kind` + non-null `property_id`/`event_id`/`variant_id`) — reviewer fix round LOW 6: the
 * old behaviour silently accepted both and let the matrix cell show whichever insert ran last. 400.
 */
export class RequirementDuplicateTargetError extends BadRequestError {
  readonly code = 'REQUIREMENT_DUPLICATE';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'RequirementDuplicateTargetError';
  }
}

/**
 * `apply` for a Bloomreach import (T-1-08, D-22) re-hashes the resent raw JSON and it no longer
 * matches the `payload_hash` returned by `preview` — the pasted data changed in between. 409, so
 * the caller re-previews rather than silently applying stale `selected_item_ids` against a
 * different plan.
 */
export class PayloadChangedError extends ConflictError {
  readonly code = 'PAYLOAD_CHANGED';
  constructor(message: string) {
    super(message);
    this.name = 'PayloadChangedError';
  }
}

/** An event or property name contains a non-ASCII character (D-38, the identity reference's Web SDK limits). 400. */
export class NameNotAsciiError extends BadRequestError {
  readonly code = 'NAME_NOT_ASCII';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'NameNotAsciiError';
  }
}

/** A project would exceed Bloomreach's 255-event-type limit (D-38). 400. */
export class LimitEventTypesError extends BadRequestError {
  readonly code = 'LIMIT_EVENT_TYPES';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'LimitEventTypesError';
  }
}

/** An event would exceed Bloomreach's 255-properties-per-event limit (D-38). 400. */
export class LimitEventPropertiesError extends BadRequestError {
  readonly code = 'LIMIT_EVENT_PROPERTIES';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'LimitEventPropertiesError';
  }
}

/**
 * `Property.item_schema_json` was set on a property whose `data_type` is not `array` (D-30
 * ItemSchema is only meaningful for list properties; T-2-06). 400.
 */
export class ItemSchemaRequiresArrayError extends BadRequestError {
  readonly code = 'ITEM_SCHEMA_REQUIRES_ARRAY';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'ItemSchemaRequiresArrayError';
  }
}

/**
 * `Rule.expression_json` fails `src/domain/rules/validate.ts` (unknown operator, or a ref to a
 * property not linked to the event/child event, D-30, D-31; T-2-06). 400.
 */
export class RuleExpressionInvalidError extends BadRequestError {
  readonly code = 'RULE_EXPRESSION_INVALID';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'RuleExpressionInvalidError';
  }
}

/**
 * `POST /events/:id/rules/from-template/purchase_items_total` when the resolved `total_price`
 * property (on the purchase-side event) does not carry the `money` data format (T-2-05 fix round,
 * T-2-07 LOW 4 ruling, D-25 Q12) — every other required property/child event resolves, only the
 * format is missing, so this is distinguished from the generic "not applicable" 400. 400.
 */
export class TemplateRequiresMoneyFormatError extends BadRequestError {
  readonly code = 'TEMPLATE_REQUIRES_MONEY_FORMAT';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'TemplateRequiresMoneyFormatError';
  }
}

/**
 * `POST /use-cases/:id/narrative/regenerate` without `force: true` when the stored narrative was
 * edited by hand more recently than it was last generated (`narrative_edited_at` set, D-32). 409,
 * so the UI can show "you edited this narrative; regenerate anyway?" instead of silently
 * overwriting the human's text.
 */
export class NarrativeEditedError extends ConflictError {
  readonly code = 'NARRATIVE_EDITED';
  constructor(message: string) {
    super(message);
    this.name = 'NarrativeEditedError';
  }
}

/** Use when a resource is not found or does not belong to the workspace (404). */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(message: string, public readonly resource?: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Use when required configuration env is missing/invalid. Map to 503 CONFIG_ERROR. */
export class ConfigError extends Error {
  readonly code = 'CONFIG_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
