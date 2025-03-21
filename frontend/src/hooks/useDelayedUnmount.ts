import React from 'react'

const useDelayedUnmount = (isMounted: boolean, delayTime: number) => {
    const [shouldRender, setShouldRender] = React.useState(false);

    React.useEffect(() => {
        let timeoutId: any;
        if (isMounted && !shouldRender) {
            setShouldRender(true);
        } else if (!isMounted && shouldRender) {
            timeoutId = setTimeout(() => setShouldRender(false), delayTime);
        }
        return () => clearTimeout(timeoutId);
    }, [isMounted, delayTime]);
    return shouldRender;
};

export default useDelayedUnmount;