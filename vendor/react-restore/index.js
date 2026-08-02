/* global require, exports */

const React = require('react')
const { create } = require('./core')

const RestoreContext = React.createContext(null)

const uuid = () => {
  let time = Date.now()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = ((time + Math.random() * 16) % 16) | 0
    time = Math.floor(time / 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

const connect = (Origin, explicitStore) => {
  let Component = Origin._restoreOrigin || Origin

  if (typeof Component === 'function' && !Component.prototype?.isReactComponent) {
    const renderFunction = Component
    class FunctionalComponent extends React.Component {
      render() {
        return renderFunction.call(this, this.props, this.context)
      }
    }
    FunctionalComponent.displayName = Component.displayName || Component.name
    FunctionalComponent.propTypes = Component.propTypes
    FunctionalComponent.defaultProps = Component.defaultProps
    Component = FunctionalComponent
  }

  class Connected extends Component {
    constructor(...args) {
      super(...args)
      this.restoreIdentity = uuid()
      this.store = explicitStore || args[1]?.store
      if (!this.store) throw new Error('[Restore] Connected component has no store')
      this.restoreContext = { store: this.store, restoreParent: this.restoreIdentity }
    }

    componentWillUnmount() {
      this.store.api.remove(this.restoreIdentity)
      if (super.componentWillUnmount) super.componentWillUnmount()
    }

    render(...args) {
      const observer = this.store.observer(super.render.bind(this, ...args), this.restoreIdentity, () =>
        this.forceUpdate()
      )
      this.store.api.report(this.restoreIdentity)
      return React.createElement(RestoreContext.Provider, { value: this.restoreContext }, observer.returned)
    }
  }

  Connected.contextType = RestoreContext
  Connected.displayName = Component.displayName || Component.name || 'Component'
  Connected._restoreOrigin = Component
  return Connected
}

const DevTools = () => {
  throw new Error(
    '<Restore.DevTools /> is now a standalone module, https://github.com/floating/restore-devtools (npm install restore-devtools)'
  )
}
const Restore = { create, connect, DevTools }

exports.create = create
exports.connect = connect
exports.DevTools = DevTools
exports.default = Restore
Object.defineProperty(exports, '__esModule', { value: true })
