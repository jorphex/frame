import Restore from 'react-restore'

import AddToken from './AddToken'
import CustomTokens from './CustomTokens'

const AddTokenForm = ({ data }) => <AddToken data={data} />

function Tokens({ data }) {
  return <>{data.notify === 'addToken' ? <AddTokenForm data={data} /> : <CustomTokens />}</>
}

export default Restore.connect(Tokens)
