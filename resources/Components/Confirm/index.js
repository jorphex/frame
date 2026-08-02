import { useState } from 'react'

const ResponseButton = ({ text, onClick }) => (
  <div role='button' className='confirmButton' onClick={onClick}>
    {text}
  </div>
)

export default function ConfirmDialog({
  prompt,
  acceptText = 'OK',
  declineText = 'Decline',
  onAccept,
  onDecline
}) {
  const [submitted, setSubmitted] = useState(false)

  const clickHandler = (evt, onClick) => {
    if (evt.button === 0 && !submitted) {
      setSubmitted(true)
      onClick()
    }
  }

  return (
    <div id='confirmationDialog' className='confirmDialog'>
      <div role='heading' className='confirmText'>
        {prompt}
      </div>

      <div className='confirmButtonOptions'>
        <ResponseButton text={declineText} onClick={(evt) => clickHandler(evt, onDecline)} />
        <ResponseButton text={acceptText} onClick={(evt) => clickHandler(evt, onAccept)} />
      </div>
    </div>
  )
}
