import { useState } from "react"
import { useSignup } from "@/hooks/useSignup";
import { AiOutlineClose } from "react-icons/ai";
import { RootState } from "@/store/store";
import { useDispatch, useSelector } from "react-redux";
import { closeLoginModal, loginSuccess } from "@/store/slices/authSlice";

export default function CreateUserModal() {
    const dispatch = useDispatch();
    const isLoginModalOpen = useSelector((state: RootState) => state.auth.isLoginModalOpen);
    const signupMutation = useSignup()
    const [user, setUser] = useState("")

    const handleSubmit = () => {
        signupMutation.mutate({ username: user }, {
            onSuccess: () => {
                dispatch(loginSuccess(user));
            },
            onError: (error) => {
                console.error("Signup failed:", error);
            }
        });
    };
    

    if(!isLoginModalOpen) {
        return null
    }
    return (
        <div className="fixed top-0 left-0 w-full h-full flex justify-center items-center">
            <div className="relative h-[200px] w-[350px] bg-black border-2 flex flex-col gap-2 rounded-md">
            <div className="absolute top-2 right-2">
                <button onClick={() => dispatch(closeLoginModal())}>
                    <AiOutlineClose color="white"/>
                </button>
            </div>
                <div className="mt-6 mx-4 flex justify-center">
                Create User
                </div>
                <div className="flex justify-center">
                    <input name="createUser" className="mx-4 rounded-md p-2" style={{backgroundColor: "#322E2E"}} placeholder="Enter username..." onChange={(e) => setUser(e.target.value)}/>
                </div>
                <div className="flex justify-center mx-4">
                <button className="mt-2 h-[30px] w-[65px] rounded-md text-black" style={{backgroundColor: "#E6EA03"}} onClick={handleSubmit}>
                    Signup
                </button>
                </div>
            </div>
        </div>
    )
}