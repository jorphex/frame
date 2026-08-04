import { useState, useEffect, useRef } from 'react'

function findIndex(options, value) {
  const index = options.findIndex((option) => option.value === value)
  return index >= 0 ? index : undefined
}

const Dropdown = ({ options, syncValue, initialValue, style, className = '', onChange }) => {
  const [localSelectedIndex, setLocalSelectedIndex] = useState(
    findIndex(options, syncValue ?? initialValue) ?? 0
  )
  const selectedIndex = syncValue === undefined ? localSelectedIndex : (findIndex(options, syncValue) ?? 0)
  const [expanded, setExpanded] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const clickHandler = (e) => {
      if (!e.composedPath().includes(ref.current)) setExpanded(false)
    }

    document.addEventListener('click', clickHandler)
    return () => document.removeEventListener('click', clickHandler)
  }, [])

  // Handle item selected
  const handleSelect = (option, index) => {
    // Trigger only on new item selected
    if (index !== selectedIndex) {
      // Return new value
      onChange(option.value)
      // Update state
      setLocalSelectedIndex(index)
    }
  }

  const indicator = (option) => {
    let indicatorClass = 'dropdownItemIndicator'
    if (option.indicator === 'good') indicatorClass += ' dropdownItemIndicatorGood'
    if (option.indicator === 'bad') indicatorClass += ' dropdownItemIndicatorBad'
    return <div className={indicatorClass} />
  }

  const height = `${options.length * 28}px`
  const marginTop = `${-28 * selectedIndex}px`

  return (
    <div className='dropdownWrap' ref={ref}>
      <div
        className={expanded ? `dropdown dropdownExpanded ${className}` : `dropdown ${className}`}
        style={expanded ? { ...style, height } : { ...style }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className='dropdownItems' role='listbox' style={expanded ? {} : { marginTop }}>
          {options.map((option, index) => {
            const words = option.text.split(' ').slice(0, 3)
            const length = words.length === 3 ? 1 : words.length === 2 ? 3 : 10
            const text = words.map((w) => w.substr(0, length)).join(' ')
            const ariaSelected = index === selectedIndex ? 'true' : 'false'

            return (
              <div
                key={option.text + index}
                className='dropdownItem'
                role='option'
                style={option.style}
                aria-selected={ariaSelected}
                value={option.value}
                onMouseDown={() => handleSelect(option, index)}
              >
                {text}
                {indicator(option)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Dropdown
