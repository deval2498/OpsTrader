import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL
export interface UserSignupCreds {
    username: string;
}

export const createUser = async (credentials: UserSignupCreds) => {
    const response = await axios.post(`${BACKEND_URL}/user/create/${credentials.username}`); // Replace with your actual login API endpoint
    return response.data;
};