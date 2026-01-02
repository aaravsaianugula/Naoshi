import pymeshlab
for f in pymeshlab.print_filter_list(return_list=True):
    if 'orient' in f:
        print(f)
