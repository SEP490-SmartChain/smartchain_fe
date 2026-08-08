import { type Customer } from '@/features/customers/types/customer';

export const mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'Alyvia Kelley',
    status: 'Approved',
    email: 'a.kelley@gmail.com',
    dob: '06/18/1978',
  },
  {
    id: '2',
    name: 'Jaiden Nixon',
    status: 'Approved',
    email: 'jaiden.n@gmail.com',
    dob: '09/30/1963',
  },
  { id: '3', name: 'Ace Foley', status: 'Blocked', email: 'ace.fo@yahoo.com', dob: '12/09/1985' },
  {
    id: '4',
    name: 'Nikolai Schmidt',
    status: 'Rejected',
    email: 'nikolai.schmidt1964@outlook.com',
    dob: '03/22/1956',
  },
  {
    id: '5',
    name: 'Clayton Charles',
    status: 'Approved',
    email: 'me@clayton.com',
    dob: '10/14/1971',
  },
  {
    id: '6',
    name: 'Prince Chen',
    status: 'Approved',
    email: 'prince.chen1997@gmail.com',
    dob: '07/05/1992',
  },
  { id: '7', name: 'Reece Duran', status: 'Approved', email: 'reece@yahoo.com', dob: '05/26/1980' },
  {
    id: '8',
    name: 'Anastasia Mcdaniel',
    status: 'Rejected',
    email: 'anastasia.spring@mcdaniel12.com',
    dob: '02/11/1968',
  },
  {
    id: '9',
    name: 'Melvin Boyle',
    status: 'Blocked',
    email: 'Me.boyle@gmail.com',
    dob: '08/03/1974',
  },
  {
    id: '10',
    name: 'Kailee Thomas',
    status: 'Blocked',
    email: 'Kailee.thomas@gmail.com',
    dob: '11/28/1954',
  },
];

export const fetchCustomersMock = async () => {
  // Simulate network delay
  return new Promise<Customer[]>((resolve) => {
    setTimeout(() => {
      resolve(mockCustomers);
    }, 500);
  });
};
