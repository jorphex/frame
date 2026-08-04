import { preserveEarnReviewWindow } from '../../../main/yearn/review'

it('keeps Earn visible while its queued transaction moves into signer review', () => {
  const setDash = jest.fn()

  preserveEarnReviewWindow(setDash)

  expect(setDash).toHaveBeenCalledWith({ showing: true })
})
