import React, { useState } from "react"
import useDelayedUnmount from "../hooks/useDelayedUnmount"
import './css/select.css'
import icons from "./icons"

export type SelectOptions = { value: string, content: React.ReactNode }[]

export const Select = ({ value, options, onChange = () => { }, defaultValue }: {
    value: string,
    options: SelectOptions,
    onChange?: (value: string) => void,
    defaultValue?: { content: React.ReactNode }
}) => {
    const [open, setOpen] = useState(false)
    const show = useDelayedUnmount(open, 250)
    const selectRef = React.useRef(null)
    return (<div className={`select ${open ? 'open' : ''}`} ref={selectRef} onClick={() => {
        setOpen(a => !a)
    }} onMouseLeave={() => {
        if (open) setOpen(false)
    }}>
        <div className="select-arrow">{icons.down}</div>
        <div className="select-value">{(options.find(a => a.value === value) || defaultValue || options.find(a => a.value === ''))?.content}</div>
        {show && <div className={`select-options${open ? '' : ' disappear'}`}>
            {options.filter(option => {
                return option.value !== value
            }).map((option, i) => <div key={i} className="select-option" onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onChange(option.value)
            }}>{option?.content}</div>)}
        </div>}
    </div>)
}
export default Select