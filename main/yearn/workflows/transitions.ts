import { YearnWorkflowSchema, type YearnWorkflow } from '../../../resources/domain/yearn'

const boundedReason = (reason: string) => reason.trim().slice(0, 240) || 'Yearn transaction failed'

const update = (workflow: YearnWorkflow, changes: Partial<YearnWorkflow>, now: number) =>
  YearnWorkflowSchema.parse({ ...workflow, ...changes, updatedAt: now })

export function queueYearnStep(workflow: YearnWorkflow, now = Date.now()) {
  const current = workflow.steps[workflow.currentStep]
  if (!current || current.status !== 'ready' || !['ready', 'active'].includes(workflow.status)) {
    throw new Error('Yearn workflow is not ready to queue')
  }
  const steps = workflow.steps.map((step, index) =>
    index === workflow.currentStep ? { ...step, status: 'awaiting-review' as const } : step
  )
  return update(workflow, { steps, status: 'active', error: undefined }, now)
}

export function submitYearnStep(workflow: YearnWorkflow, txHash: string, now = Date.now()) {
  const current = workflow.steps[workflow.currentStep]
  if (!current || current.status !== 'awaiting-review') {
    throw new Error('Yearn workflow has no request awaiting review')
  }
  const steps = workflow.steps.map((step, index) =>
    index === workflow.currentStep
      ? { ...step, status: 'submitted' as const, txHash, error: undefined }
      : step
  )
  return update(workflow, { steps, status: 'waiting-confirmation', error: undefined }, now)
}

export function failYearnStep(workflow: YearnWorkflow, reason: string, now = Date.now()) {
  const current = workflow.steps[workflow.currentStep]
  if (!current || !['ready', 'awaiting-review', 'submitted'].includes(current.status)) {
    throw new Error('Yearn workflow has no active step to fail')
  }
  const error = boundedReason(reason)
  const steps = workflow.steps.map((step, index) =>
    index === workflow.currentStep ? { ...step, status: 'error' as const, error } : step
  )
  return update(workflow, { steps, status: 'error', error }, now)
}

export function retryYearnStep(workflow: YearnWorkflow, now = Date.now()) {
  const current = workflow.steps[workflow.currentStep]
  if (!current || current.status !== 'error' || current.txHash) {
    throw new Error('This Yearn workflow step cannot be retried')
  }
  const steps = workflow.steps.map((step, index) =>
    index === workflow.currentStep
      ? { ...step, status: 'ready' as const, error: undefined, txHash: undefined }
      : step
  )
  return update(workflow, { steps, status: 'ready', error: undefined }, now)
}

export function confirmYearnStep(workflow: YearnWorkflow, now = Date.now()) {
  const current = workflow.steps[workflow.currentStep]
  if (!current || current.status !== 'submitted' || !current.txHash) {
    throw new Error('Yearn workflow has no submitted step to confirm')
  }
  const nextIndex = workflow.currentStep + 1
  const complete = nextIndex >= workflow.steps.length
  const steps = workflow.steps.map((step, index) => {
    if (index === workflow.currentStep) return { ...step, status: 'confirmed' as const }
    if (!complete && index === nextIndex) return { ...step, status: 'ready' as const }
    return step
  })
  return update(
    workflow,
    {
      steps,
      currentStep: complete ? workflow.currentStep : nextIndex,
      status: complete ? 'complete' : 'ready',
      error: undefined
    },
    now
  )
}

export function hasOutstandingApproval(workflow: YearnWorkflow) {
  const lastConfirmedApproval = [...workflow.steps]
    .reverse()
    .find(({ kind, status }) => ['approve', 'revoke'].includes(kind) && status === 'confirmed')
  return lastConfirmedApproval?.kind === 'approve'
}

export function cancelYearnWorkflow(workflow: YearnWorkflow, now = Date.now()) {
  if (
    workflow.status === 'waiting-confirmation' ||
    workflow.steps.some(({ status }) => status === 'submitted')
  ) {
    throw new Error('A submitted Yearn transaction cannot be canceled')
  }
  if (hasOutstandingApproval(workflow)) {
    throw new Error('Revoke the remaining token approval before closing this workflow')
  }
  if (workflow.status === 'complete') throw new Error('A completed Yearn workflow cannot be canceled')
  return update(workflow, { status: 'canceled', error: undefined }, now)
}
