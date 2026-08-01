import { render, screen } from '../../../componentSetup'
import EditTokenSpend from '../../../../resources/Components/EditTokenSpend'
import BigNumber from 'bignumber.js'
import { max } from '../../../../resources/utils/numbers'

const maxIntStr = max.toString(10)

describe('changing approval amounts', () => {
  it('allows the user to set the token approval to a custom amount', async () => {
    const onUpdate = jest.fn()
    const requestedAmount = BigNumber('0x011170')
    const approval = {
      id: 'erc20:approve',
      data: {
        spender: {
          address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4',
          ens: '',
          type: 'external'
        },
        amount: '0x' + requestedAmount.toString(16),
        decimals: 4,
        name: 'TST',
        symbol: 'TST',
        contract: {
          address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698',
          ens: '',
          type: 'contract'
        }
      }
    }

    const { user } = render(
      <EditTokenSpend data={approval.data} requestedAmount={requestedAmount} updateRequest={onUpdate} />
    )

    const custom = screen.queryByRole('button', { name: 'Custom' })
    await user.click(custom)

    const enterAmount = screen.queryByRole('textbox', { label: 'Custom Amount' })
    await user.type(enterAmount, '50')

    const updateCustom = screen.getByText('update')
    await user.click(updateCustom)

    expect(onUpdate).toHaveBeenCalledWith('500000')
  })

  it('allows users to input custom amounts which are decimal', async () => {
    const onUpdate = jest.fn()
    const requestedAmount = BigNumber('0x011170')
    const approval = {
      id: 'erc20:approve',
      data: {
        spender: {
          address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4',
          ens: '',
          type: 'external'
        },
        amount: '0x' + requestedAmount.toString(16),
        decimals: 4,
        name: 'TST',
        symbol: 'TST',
        contract: {
          address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698',
          ens: '',
          type: 'contract'
        }
      }
    }

    const { user } = render(
      <EditTokenSpend data={approval.data} requestedAmount={requestedAmount} updateRequest={onUpdate} />
    )

    const custom = screen.queryByRole('button', { name: 'Custom' })
    await user.click(custom)

    const enterAmount = screen.queryByRole('textbox', { label: 'Custom Amount' })
    await user.type(enterAmount, '50.1')

    const updateCustom = screen.getByText('update')
    await user.click(updateCustom)

    expect(onUpdate).toHaveBeenCalledWith('501000')
  })

  it('does not allow users to input a custom amount with more decimals than allowed by the contract', async () => {
    const onUpdate = jest.fn()
    const requestedAmount = BigNumber('0x011170')
    const approval = {
      id: 'erc20:approve',
      data: {
        spender: {
          address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4',
          ens: '',
          type: 'external'
        },
        amount: '0x' + requestedAmount.toString(16),
        decimals: 4,
        name: 'TST',
        symbol: 'TST',
        contract: {
          address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698',
          ens: '',
          type: 'contract'
        }
      }
    }

    const { user } = render(
      <EditTokenSpend data={approval.data} requestedAmount={requestedAmount} updateRequest={onUpdate} />
    )

    const custom = screen.queryByRole('button', { name: 'Custom' })
    await user.click(custom)

    const enterAmount = screen.queryByRole('textbox', { label: 'Custom Amount' })
    await user.type(enterAmount, '50.00001')

    expect(screen.getByText('invalid')).toBeTruthy()
    expect(screen.queryByText('update')).toBeNull()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('does not allows the user to set the token approval to a custom amount for an unknown token', () => {
    const requestedAmount = BigNumber('0x100e6')
    const approval = {
      id: 'erc20:approve',
      data: {
        spender: {
          address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4',
          ens: '',
          type: 'external'
        },
        amount: '0x' + requestedAmount.toString(16),
        decimals: 6,
        symbol: 'aUSDC',
        contract: {
          address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698',
          type: 'contract',
          ens: ''
        }
      }
    }

    render(<EditTokenSpend data={approval.data} requestedAmount={requestedAmount} updateRequest={() => {}} />)

    const custom = screen.queryByRole('button', { name: 'Custom' })
    expect(custom).toBe(null)
  })

  it('allows the user to set the token approval to unlimited', async () => {
    const onUpdate = jest.fn()
    const requestedAmount = BigNumber('0x011170')

    const approval = {
      id: 'erc20:approve',
      data: {
        spender: { address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4', ens: '', type: 'external' },
        amount: '0x' + requestedAmount.toString(16),
        decimals: 4,
        name: 'TST',
        symbol: 'TST',
        contract: { address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698', ens: '', type: 'contract' }
      }
    }

    const { user } = render(
      <EditTokenSpend data={approval.data} requestedAmount={requestedAmount} updateRequest={onUpdate} />
    )

    const custom = screen.queryByRole('button', { name: 'Custom' })
    await user.click(custom)

    const setUnlimited = screen.queryByRole('button', { name: 'Unlimited' })
    await user.click(setUnlimited)

    expect(onUpdate).toHaveBeenCalledWith(maxIntStr)
  })

  it('allows the user to revoke a transaction approval explicitly', async () => {
    const onUpdate = jest.fn()
    const requestedAmount = BigNumber('100')
    const approval = {
      data: {
        spender: { address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4', ens: '', type: 'external' },
        amount: '100',
        decimals: 0,
        name: 'TST',
        symbol: 'TST',
        contract: { address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698', ens: '', type: 'contract' }
      }
    }

    const { user } = render(
      <EditTokenSpend
        canRevoke
        data={approval.data}
        requestedAmount={requestedAmount}
        updateRequest={onUpdate}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Revoke' }))

    expect(onUpdate).toHaveBeenCalledWith('0')
  })

  it('supports exact custom amounts for zero-decimal tokens', async () => {
    const onUpdate = jest.fn()
    const approval = {
      data: {
        spender: { address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4', ens: '', type: 'external' },
        amount: '1',
        decimals: 0,
        name: 'Whole Token',
        symbol: 'WHOLE',
        contract: { address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698', ens: '', type: 'contract' }
      }
    }

    const { user } = render(
      <EditTokenSpend data={approval.data} requestedAmount={BigNumber(1)} updateRequest={onUpdate} />
    )

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    await user.type(screen.getByRole('textbox', { name: 'Custom Amount' }), '42')
    await user.click(screen.getByText('update'))

    expect(onUpdate).toHaveBeenCalledWith('42')
  })

  it('supports zero-padded ABI hex amounts', async () => {
    const onUpdate = jest.fn()
    const approval = {
      data: {
        spender: { address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4', ens: '', type: 'external' },
        amount: '0x01',
        decimals: 0,
        name: 'Whole Token',
        symbol: 'WHOLE',
        contract: { address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698', ens: '', type: 'contract' }
      }
    }

    const { user } = render(
      <EditTokenSpend data={approval.data} requestedAmount={BigNumber(1)} updateRequest={onUpdate} />
    )

    expect(screen.getByText('1')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByRole('textbox', { name: 'Custom Amount' })).toBeTruthy()
  })

  it('shows malformed stored amounts as unknown and keeps editing locked', () => {
    const approval = {
      data: {
        spender: { address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4', ens: '', type: 'external' },
        amount: '-1',
        decimals: 0,
        name: 'Whole Token',
        symbol: 'WHOLE',
        contract: { address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698', ens: '', type: 'contract' }
      }
    }

    render(
      <EditTokenSpend
        canRevoke
        data={approval.data}
        requestedAmount={BigNumber(1)}
        updateRequest={() => {}}
      />
    )

    expect(screen.getByText('unknown')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Custom' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Requested' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unlimited' })).toBeNull()
    expect(screen.queryByText('Approval Revoked')).toBeNull()
  })

  it('shows exponent input as invalid instead of coercing it', async () => {
    const onUpdate = jest.fn()
    const approval = {
      data: {
        spender: { address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4', ens: '', type: 'external' },
        amount: '1',
        decimals: 18,
        name: 'TST',
        symbol: 'TST',
        contract: { address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698', ens: '', type: 'contract' }
      }
    }

    const { user } = render(
      <EditTokenSpend data={approval.data} requestedAmount={BigNumber(1)} updateRequest={onUpdate} />
    )

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    const input = screen.getByRole('textbox', { name: 'Custom Amount' })
    await user.type(input, '1e2{Enter}')

    expect(input.value).toBe('1e2')
    expect(screen.getByText('invalid')).toBeTruthy()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('allows the user to revert the token approval back to the original request', async () => {
    const onUpdate = jest.fn()
    const requestedAmountHex = '0x011170'
    const requestedAmount = BigNumber(requestedAmountHex)
    const approval = {
      id: 'erc20:approve',
      data: {
        spender: { address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4', ens: '', type: 'external' },
        amount: requestedAmountHex,
        decimals: 4,
        name: 'TST',
        symbol: 'TST',
        contract: {
          address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698',
          ens: '',
          type: 'contract'
        }
      }
    }

    const { user } = render(
      <EditTokenSpend data={approval.data} requestedAmount={requestedAmount} updateRequest={onUpdate} />
    )

    const setUnlimited = screen.queryByRole('button', { name: 'Unlimited' })
    await user.click(setUnlimited)

    const setRequested = screen.queryByRole('button', { name: 'Requested' })
    await user.click(setRequested)

    expect(onUpdate).toHaveBeenNthCalledWith(1, maxIntStr)
    expect(onUpdate).toHaveBeenNthCalledWith(2, '70000')
  })

  it('allows the user to revert the token approval back to the original amount when no decimal data is present', async () => {
    const onUpdate = jest.fn()
    const requestedAmountHex = '0x011170'
    const requestedAmount = BigNumber(requestedAmountHex)
    const approval = {
      id: 'erc20:approve',
      data: {
        spender: {
          address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4',
          ens: '',
          type: 'external'
        },
        amount: requestedAmountHex,
        name: 'TST',
        symbol: 'TST',
        contract: {
          address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698',
          ens: '',
          type: 'contract'
        }
      }
    }

    const { user } = render(
      <EditTokenSpend data={approval.data} requestedAmount={requestedAmount} updateRequest={onUpdate} />
    )

    const setUnlimited = screen.queryByRole('button', { name: 'Unlimited' })
    await user.click(setUnlimited)

    const setRequested = screen.queryByRole('button', { name: 'Requested' })
    await user.click(setRequested)

    expect(onUpdate).toHaveBeenNthCalledWith(1, maxIntStr)
    expect(onUpdate).toHaveBeenNthCalledWith(2, BigNumber('0x011170').toString(10))
  })

  const requiredApprovalData = ['decimals', 'symbol', 'name']

  requiredApprovalData.forEach((field) => {
    it(`does not allow the user to edit the amount if ${field} is not present in approval data`, async () => {
      const requestedAmountHex = '0x' + (100e6).toString(16)
      const approval = {
        id: 'erc20:approve',
        data: {
          spender: {
            address: '0x9bc5baf874d2da8d216ae9f137804184ee5afef4',
            ens: '',
            type: 'external'
          },
          amount: requestedAmountHex,
          decimals: 6,
          name: 'TST',
          symbol: 'TST',
          contract: {
            address: '0x1eba19f260421142AD9Bf5ba193f6d4A0825e698',
            ens: '',
            type: 'contract'
          }
        }
      }

      delete approval.data[field]

      const { user } = render(
        <EditTokenSpend
          data={approval.data}
          requestedAmount={BigNumber(requestedAmountHex)}
          updateRequest={() => {}}
        />
      )

      const custom = screen.queryByRole('button', { name: 'Custom' })
      expect(custom).toBeNull()

      const requestedAmount = screen.queryByRole('textbox')
      const displayedContent = requestedAmount.textContent.trim()
      expect(displayedContent).toBe(approval.data.decimals ? '100' : '100000000')

      // ensure click on requested amount textbox doesn't allow user to enter a custom amount
      await user.click(requestedAmount)
      expect(screen.queryByRole('textbox', { name: 'Custom Amount' })).toBeNull()
    })
  })
})
