import { describe, expect, it } from 'vitest'
import { parseEntitiesMd } from './parse-entities-md'

describe('parseEntitiesMd', () => {
  it('parses entity descriptions and field sources', () => {
    const result = parseEntitiesMd(`
## customer (Customer)
Person onboarding.

| Key | Label | Type | Required | Source |
|---|---|---|---|---|
| email | Email | email | yes | user_input: collect_profile/email |
| account_id | Account ID | string | no | tool: build_account@create_account/id |

## order (Order)
| Key | Type | Source |
|---|---|---|
| order_id | string | user_input: collect_order |
`)

    expect(result.errors).toEqual([])
    expect(result.entities).toHaveLength(2)
    expect(result.entities[0]).toMatchObject({
      id: 'customer',
      name: 'Customer',
      description: 'Person onboarding.',
      fields: [
        {
          key: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          source: {
            kind: 'user_input',
            formStepId: 'collect_profile',
            inputKey: 'email',
          },
        },
        {
          key: 'account_id',
          label: 'Account ID',
          type: 'string',
          required: false,
          source: {
            kind: 'tool',
            tool: 'build_account',
            stepId: 'create_account',
            resultPath: 'id',
          },
        },
      ],
    })
    expect(result.entities[1]).toMatchObject({
      id: 'order',
      name: 'Order',
      fields: [
        {
          key: 'order_id',
          type: 'string',
          source: { kind: 'user_input', formStepId: 'collect_order' },
        },
      ],
    })
  })

  it('reports malformed markdown and invalid field rows', () => {
    const empty = parseEntitiesMd('plain text without entity headings')
    expect(empty.entities).toEqual([])
    expect(empty.errors[0]).toContain('no entities found')

    const broken = parseEntitiesMd(`
## broken (Broken)
Some description.

| Key | Type | Source |
|---|---|---|
| bad_type | nope | invalid |
| bad_source | string | invalid source |
| missing_source | string | |
`)

    expect(broken.entities).toEqual([])
    expect(broken.errors.some((error) => error.includes('invalid type'))).toBe(
      true,
    )
    expect(
      broken.errors.some((error) => error.includes('invalid source')),
    ).toBe(true)
    expect(
      broken.errors.some((error) => error.includes('missing source column')),
    ).toBe(true)
  })
})
